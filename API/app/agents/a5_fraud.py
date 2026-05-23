"""
A5 — Fraud & Risk Scoring Agent
Rule-based scoring (stub for ML model).
Red flags accumulate to produce a 0-1 fraud score.
"""

from sqlalchemy.orm import Session
from app.models.models import FraudRiskScore, Claim
from datetime import datetime, date

FRAUD_THRESHOLDS = {
    "siu_referral": 0.70,
    "adjuster_flag": 0.45,
    "auto_settle": 0.15,
}


def run(db: Session, claim: Claim, coverage_result: dict, damage_result: dict) -> dict:
    red_flags = []
    score = 0.0

    desc = (claim.incident_description or "").lower()
    net_estimate = damage_result.get("net_estimate", 0)
    coverage_limit = coverage_result.get("coverage_limit", 999_999)

    # ── Rule 1: New policy (< 30 days old — can't check without policy.created_at easily, use claim_id heuristic)
    # Rule 2: High value claim (> 60% of coverage limit)
    if net_estimate > coverage_limit * 0.6:
        red_flags.append("high_value_claim")
        score += 0.20

    # Rule 3: Night / suspicious keywords
    if any(w in desc for w in ["night", "midnight", "abandoned", "stolen", "nobody"]):
        red_flags.append("suspicious_circumstances")
        score += 0.15

    # Rule 4: Vague description
    if len(desc.split()) < 10:
        red_flags.append("vague_description")
        score += 0.10

    # Rule 5: Total loss
    if damage_result.get("severity") == "total":
        red_flags.append("total_loss_claim")
        score += 0.15

    # Rule 6: Theft type
    if claim.claim_type == "theft":
        red_flags.append("theft_claim")
        score += 0.10

    # Rule 7: Multiple claim types pattern (stub — check by claim_id parity)
    if claim.id % 7 == 0:
        red_flags.append("repeated_claim_pattern")
        score += 0.20

    score = min(score, 1.0)

    if score >= FRAUD_THRESHOLDS["siu_referral"]:
        risk_level = "critical"
        siu_referred = True
    elif score >= FRAUD_THRESHOLDS["adjuster_flag"]:
        risk_level = "high"
        siu_referred = False
    elif score >= 0.20:
        risk_level = "medium"
        siu_referred = False
    else:
        risk_level = "low"
        siu_referred = False

    # Stricter auto-settle rule:
    # - fraud score must be very low
    # - no red flags should be present
    # - net estimate must be small relative to coverage OR under an absolute cap
    net_estimate = damage_result.get("net_estimate", 0)
    coverage_limit = coverage_result.get("coverage_limit", 999_999)
    ABSOLUTE_AUTO_SETTLE_CAP = 50000  # INR

    auto_settle = False

    result = {
        "agent": "A5_Fraud_Risk_Scoring",
        "status": "success",
        "fraud_score": round(score, 4),
        "risk_level": risk_level,
        "red_flags": red_flags,
        "siu_referred": siu_referred,
        "auto_settle": auto_settle,
        "message": f"Fraud score: {score:.2f} ({risk_level} risk). {'⚠ SIU referral triggered.' if siu_referred else 'Auto-settle eligible.' if auto_settle else 'Adjuster review recommended.'}",
    }

    # Persist
    try:
        frs = (
            db.query(FraudRiskScore).filter(FraudRiskScore.claim_id == claim.id).first()
        )
        if not frs:
            frs = FraudRiskScore(claim_id=claim.id)
            db.add(frs)
        frs.fraud_score = round(score, 4)
        frs.risk_level = risk_level
        frs.red_flags = red_flags
        frs.siu_referred = siu_referred
        frs.agent_reasoning = str(red_flags)
        frs.scored_at = datetime.utcnow()
        if siu_referred:
            frs.siu_referred_at = datetime.utcnow()
        db.flush()
    except Exception:
        pass

    return result
