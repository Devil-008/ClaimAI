"""
A3 — Coverage Verification Agent
Checks: policy active, not expired, incident type covered, within coverage limit.
"""
from sqlalchemy.orm import Session
from app.models.models import Policy, Claim
from datetime import date

# Which claim types are covered by which policy types
COVERAGE_MATRIX = {
    "auto":       ["auto_accident", "theft", "weather", "other"],
    "property":   ["property_damage", "theft", "weather", "other"],
    "health":     ["medical", "other"],
    "life":       ["other"],
    "commercial": ["property_damage", "theft", "weather", "auto_accident", "other"],
}

def run(db: Session, claim: Claim) -> dict:
    policy = db.query(Policy).filter(Policy.id == claim.policy_id).first()

    if not policy:
        return _fail("A3_Coverage_Verification", "Policy not found", {"policy_id": claim.policy_id})

    today = date.today()

    # 1. Policy active?
    if policy.status != "active":
        return _fail("A3_Coverage_Verification", f"Policy is {policy.status}", {"policy_status": policy.status})

    # 2. Policy not expired?
    if policy.expiry_date < today:
        return _fail("A3_Coverage_Verification", "Policy expired", {"expiry_date": str(policy.expiry_date)})

    # 2b. Check remaining coverage capacity
    from sqlalchemy import func
    from app.models.models import Settlement
    total_settled = db.query(func.sum(Settlement.net_payout)).join(Claim, Claim.id == Settlement.claim_id).filter(
        Claim.policy_id == policy.id,
        Claim.status == "settled"
    ).scalar() or 0.0
    total_settled = float(total_settled)
    remaining_capacity = float(policy.coverage_limit or 0) - total_settled
    if remaining_capacity <= 0:
        return _fail(
            "A3_Coverage_Verification",
            f"Policy coverage limit exhausted. Limit: ₹{policy.coverage_limit:,.2f}, Total Settled: ₹{total_settled:,.2f}.",
            {"policy_limit": float(policy.coverage_limit), "total_settled": total_settled}
        )

    # 3. Claim type covered?
    covered_types = COVERAGE_MATRIX.get(policy.policy_type, [])
    if claim.claim_type not in covered_types:
        return _fail("A3_Coverage_Verification",
                     f"Claim type '{claim.claim_type}' not covered under '{policy.policy_type}' policy",
                     {"claim_type": claim.claim_type, "covered_types": covered_types})

    return {
        "agent":              "A3_Coverage_Verification",
        "status":             "success",
        "covered":            True,
        "policy_number":      policy.policy_number,
        "policy_type":        policy.policy_type,
        "coverage_limit":     float(policy.coverage_limit),
        "deductible":         float(policy.deductible),
        "expiry_date":        str(policy.expiry_date),
        "exclusions":         policy.exclusions,
        "message":            "Coverage verified — claim type covered, policy active",
    }


def _fail(agent: str, reason: str, data: dict) -> dict:
    return {
        "agent":   agent,
        "status":  "failed",
        "covered": False,
        "reason":  reason,
        **data,
    }
