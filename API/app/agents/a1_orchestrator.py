"""
A1 — Orchestrator
Controls the full pipeline: A2 → A3 → A4 → A5 → A6/A7
Returns a detailed pipeline_trace for UI display.
"""

from sqlalchemy.orm import Session
from app.models.models import Claim
from datetime import datetime
import traceback

from app.agents import (
    a2_fnol,
    a3_coverage,
    a4_damage,
    a5_fraud,
    a6_settlement,
    a7_handoff,
    a8_chatbot,
)
from app.services.email_escalation_service import notify_claimant_update


def run_pipeline(
    db: Session,
    claim: Claim,
    fnol_payload: dict,
    file_paths: list = None,
) -> dict:
    """
    Execute the full agent pipeline for a claim.
    Updates claim.status at each step.
    Returns full trace dict for API response + UI display.
    """
    trace = []
    started_at = datetime.utcnow()

    def step(name: str, fn, *args, **kwargs):
        t0 = datetime.utcnow()
        try:
            result = fn(*args, **kwargs)
            ms = int((datetime.utcnow() - t0).total_seconds() * 1000)
            trace.append(
                {
                    "step": name,
                    "status": result.get("status", "success"),
                    "ms": ms,
                    "result": result,
                }
            )
            return result
        except Exception as e:
            ms = int((datetime.utcnow() - t0).total_seconds() * 1000)
            err = {
                "agent": name,
                "status": "error",
                "error": str(e),
                "trace": traceback.format_exc(),
            }
            trace.append({"step": name, "status": "error", "ms": ms, "result": err})
            return err

    # ── A2: FNOL Intake
    claim.status = "fnol_received"
    db.flush()
    a2_result = step("A2_FNOL_Intake", a2_fnol.run, db, claim, fnol_payload)

    # ── A3: Coverage Verification
    claim.status = "coverage_verification"
    db.flush()
    a3_result = step("A3_Coverage_Verification", a3_coverage.run, db, claim)

    if not a3_result.get("covered"):
        # Coverage rejected → close claim
        claim.status = "rejected"
        claim.closed_at = datetime.utcnow()
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} could not be settled",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} could not proceed to settlement because coverage was denied.\n"
                f"Please review the claim details and contact support if you need clarification.\n"
            ),
            event_type="coverage_rejected",
            source_status="rejected",
            trigger_reason=a3_result.get("reason", "Coverage denied"),
        )
        db.commit()
        return _build_response(
            claim,
            trace,
            started_at,
            "rejected",
            f"Coverage denied: {a3_result.get('reason','unknown')}",
        )

    # ── A4: Damage Assessment
    claim.status = "damage_assessment"
    db.flush()
    a4_result = step(
        "A4_Damage_Assessment", a4_damage.run, db, claim, a3_result, file_paths
    )

    # ── Coverage Limit Check Gate
    from sqlalchemy import func
    from app.models.models import Settlement, Policy
    total_settled = db.query(func.sum(Settlement.net_payout)).join(Claim, Claim.id == Settlement.claim_id).filter(
        Claim.policy_id == claim.policy_id,
        Claim.status == "settled",
        Claim.id != claim.id
    ).scalar() or 0.0
    total_settled = float(total_settled)
    policy = db.query(Policy).filter(Policy.id == claim.policy_id).first()
    coverage_limit = float(policy.coverage_limit or 0) if policy else 0.0
    remaining_capacity = max(0.0, coverage_limit - total_settled)
    
    net_estimate = float(a4_result.get("net_estimate", 0))
    if net_estimate > remaining_capacity:
        claim.status = "rejected"
        claim.closed_at = datetime.utcnow()
        outcome_msg = f"Claim estimate of ₹{net_estimate:,.2f} exceeds remaining policy capacity of ₹{remaining_capacity:,.2f} (Total Settled: ₹{total_settled:,.2f}, Limit: ₹{coverage_limit:,.2f})."
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} coverage limit exceeded",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} could not proceed because the estimated amount of ₹{net_estimate:,.2f} "
                f"exceeds the remaining coverage capacity of ₹{remaining_capacity:,.2f} under your policy.\n"
                f"Policy Limit: ₹{coverage_limit:,.2f}\n"
                f"Total Settled: ₹{total_settled:,.2f}\n"
            ),
            event_type="coverage_limit_exceeded",
            source_status="rejected",
            trigger_reason=outcome_msg,
        )
        db.commit()
        return _build_response(
            claim,
            trace,
            started_at,
            "rejected",
            outcome_msg,
        )

    # ── A5: Fraud & Risk Scoring
    claim.status = "fraud_scoring"
    db.flush()
    a5_result = step(
        "A5_Fraud_Risk_Scoring", a5_fraud.run, db, claim, a3_result, a4_result
    )

    # ── Decision gate
    auto_settle = a5_result.get("auto_settle", False)
    siu_referred = a5_result.get("siu_referred", False)

    if auto_settle:
        # ── A6: Auto-Settlement
        a6_result = step(
            "A6_Settlement", a6_settlement.run, db, claim, a4_result, a5_result
        )
        final_status = "settlement_pending"
        outcome = "auto_settled"
        outcome_msg = a6_result.get("message", "Auto-settlement initiated")
    else:
        # ── A7: Adjuster / SIU Handoff
        a7_result = step(
            "A7_Adjuster_Handoff",
            a7_handoff.run,
            db,
            claim,
            a5_result,
            a3_result,
            a4_result,
        )
        final_status = claim.status  # set by A7
        outcome = "siu_escalated" if siu_referred else "adjuster_escalated"
        outcome_msg = a7_result.get("message", "Escalated for manual review")
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} is under review",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} has been escalated for manual review.\n"
                f"Current status: {claim.status.replace('_', ' ').title()}\n"
                f"We will update you once a reviewer takes action.\n"
            ),
            event_type="fraud_or_manual_escalation",
            source_status=claim.status,
            trigger_reason=a7_result.get("reason", outcome_msg),
        )

    # ── A8: Notify claimant
    a8_notify = a8_chatbot.notify(claim)
    trace.append(
        {
            "step": "A8_Chatbot",
            "status": a8_notify.get("status", "success"),
            "ms": 0,
            "result": a8_notify,
        }
    )

    db.commit()

    return _build_response(claim, trace, started_at, outcome, outcome_msg)


def _build_response(
    claim: Claim, trace: list, started_at: datetime, outcome: str, outcome_msg: str
) -> dict:
    elapsed_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000)
    return {
        "claim_id": claim.id,
        "claim_number": claim.claim_number,
        "claim_status": claim.status,
        "outcome": outcome,
        "outcome_msg": outcome_msg,
        "elapsed_ms": elapsed_ms,
        "pipeline_trace": trace,
    }
