"""
A4 — Damage Assessment Agent
Estimates damage cost from claim type, description keywords, and coverage limit.
In production: CV model on photos, repair database lookup.
"""
from sqlalchemy.orm import Session
from app.models.models import DamageAssessment, Claim, Policy
from datetime import datetime
import random

# Base estimate ranges per claim type (INR)
DAMAGE_RANGES = {
    "auto_accident":    (15_000,  2_00_000),
    "property_damage":  (25_000,  5_00_000),
    "theft":            (20_000,  4_00_000),
    "medical":          (10_000,  3_00_000),
    "weather":          (30_000,  6_00_000),
    "other":            (5_000,   1_00_000),
}

SEVERITY_MAP = {
    "minor":    (0.10, 0.25),
    "moderate": (0.25, 0.50),
    "severe":   (0.50, 0.80),
    "total":    (0.80, 1.00),
}

def run(db: Session, claim: Claim, coverage_result: dict, file_paths: list = None) -> dict:
    low, high = DAMAGE_RANGES.get(claim.claim_type, (10_000, 1_00_000))

    # Severity from description keywords
    desc = (claim.incident_description or "").lower()
    if any(w in desc for w in ["total", "destroyed", "burnt", "completely"]):
        severity = "total"
    elif any(w in desc for w in ["major", "severe", "significant"]):
        severity = "severe"
    elif any(w in desc for w in ["minor", "small", "scratch", "dent"]):
        severity = "minor"
    else:
        severity = "moderate"

    sev_low, sev_high = SEVERITY_MAP[severity]
    coverage_limit = coverage_result.get("coverage_limit", high)
    deductible     = coverage_result.get("deductible", 0)

    # Estimated amount (deterministic seed from claim id for consistency)
    rng = random.Random(claim.id * 137)
    raw_estimate = rng.uniform(low * sev_low + high * sev_low,
                                low * sev_high + high * sev_high)
    raw_estimate = min(raw_estimate, coverage_limit)
    net_estimate = max(0, raw_estimate - deductible)

    photos_analyzed = len(file_paths) if file_paths else 0

    assessment_result = {
        "agent":           "A4_Damage_Assessment",
        "status":          "success",
        "severity":        severity,
        "estimated_gross": round(raw_estimate, 2),
        "deductible":      deductible,
        "net_estimate":    round(net_estimate, 2),
        "coverage_limit":  coverage_limit,
        "photos_analyzed": photos_analyzed,
        "method":          "cv_model_stub_v1" if photos_analyzed else "description_nlp_v1",
        "message":         f"Damage assessed: {severity} severity, est. ₹{net_estimate:,.0f} net payout",
    }

    # Persist to damage_assessments table if it exists
    try:
        da = DamageAssessment(
            claim_id         = claim.id,
            assessor_type    = "agent",
            damage_severity  = severity,
            estimated_amount = round(raw_estimate, 2),
            photos_analyzed  = photos_analyzed,
            assessment_notes = assessment_result["message"],
            assessment_date  = datetime.utcnow().date(),
            completed_at     = datetime.utcnow(),
        )
        db.add(da)
        db.flush()
        assessment_result["assessment_id"] = da.id
    except Exception:
        pass  # table may not exist yet

    return assessment_result
