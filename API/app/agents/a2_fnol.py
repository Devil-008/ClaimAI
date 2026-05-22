"""
A2 — FNOL Intake Agent
Accepts: structured form, document text, voice transcript, photo metadata
Outputs: normalized FNOL record saved to fnol_submissions table
"""
from sqlalchemy.orm import Session
from app.models.models import FNOLSubmission, Claim
from datetime import datetime
import json

def run(db: Session, claim: Claim, payload: dict) -> dict:
    """
    payload keys (any combination):
      - input_type: form | document | email | voice | photo
      - raw_text:   OCR text / email body / voice transcript
      - entities:   pre-extracted dict (optional)
      - file_path:  uploaded file path (optional)
    Returns agent result dict.
    """
    input_type = payload.get("input_type", "form")
    raw_text   = payload.get("raw_text", "")
    file_path  = payload.get("file_path")

    # Simple entity extraction (in production: NLP/OCR model)
    entities = payload.get("entities") or _extract_entities(raw_text, claim)

    fnol = FNOLSubmission(
        claim_id        = claim.id,
        raw_input_type  = input_type,
        raw_input_path  = file_path,
        extracted_entities = entities,
        ocr_text        = raw_text if input_type in ("document", "email") else None,
        voice_transcript= raw_text if input_type == "voice" else None,
        intake_status   = "processed",
        processing_notes= f"A2 processed at {datetime.utcnow().isoformat()}",
        processed_at    = datetime.utcnow(),
    )
    db.add(fnol)
    db.flush()

    return {
        "agent": "A2_FNOL_Intake",
        "status": "success",
        "fnol_id": fnol.id,
        "entities": entities,
        "input_type": input_type,
        "message": f"FNOL intake complete via {input_type}",
    }


def _extract_entities(text: str, claim: Claim) -> dict:
    """Lightweight rule-based extraction (stub for NER model)."""
    return {
        "claim_type":    claim.claim_type,
        "incident_date": str(claim.incident_date),
        "description":   claim.incident_description or text[:500],
        "channel":       claim.channel,
        "extracted_by":  "A2_rule_engine_v1",
    }
