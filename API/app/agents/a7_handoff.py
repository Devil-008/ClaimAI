"""
A7 — Adjuster Handoff Agent
Escalates complex/high-risk claims to human adjusters or SIU.
"""

from sqlalchemy.orm import Session
from app.models.models import Claim
from datetime import datetime

from app.services.email_escalation_service import notify_claim_escalation


def run(
    db: Session,
    claim: Claim,
    fraud_result: dict,
    coverage_result: dict,
    damage_result: dict,
    reason: str = None,
) -> dict:

    siu_referred = fraud_result.get("siu_referred", False)
    risk_level = fraud_result.get("risk_level", "medium")
    red_flags = fraud_result.get("red_flags", [])

    if siu_referred:
        claim.status = "escalated_siu"
        escalation_type = "siu"
        reason = (
            reason
            or f"Fraud score {fraud_result['fraud_score']:.2f} — SIU referral threshold exceeded"
        )
    else:
        claim.status = "escalated_adjuster"
        escalation_type = "adjuster"
        reason = reason or (
            f"Risk level: {risk_level}. "
            f"Red flags: {', '.join(red_flags) if red_flags else 'edge case'}. "
            f"Estimate: ₹{damage_result.get('net_estimate', 0):,.0f}"
        )

    claim.updated_at = datetime.utcnow()
    db.flush()
    notify_claim_escalation(db, claim, event_type="initial_escalation")

    return {
        "agent": "A7_Adjuster_Handoff",
        "status": "success",
        "escalation_type": escalation_type,
        "claim_status": claim.status,
        "reason": reason,
        "red_flags": red_flags,
        "fraud_score": fraud_result.get("fraud_score"),
        "message": f"Claim escalated to {'SIU' if siu_referred else 'human adjuster'}. Reason: {reason}",
    }
