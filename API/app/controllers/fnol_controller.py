"""
FNOL Controller — handles all 5 intake types + triggers A1 pipeline.

POST /api/fnol/submit         — structured form
POST /api/fnol/upload-doc     — document / PDF upload
POST /api/fnol/upload-photo   — damage photo upload
GET  /api/fnol/{claim_id}/pipeline  — get pipeline trace
POST /api/fnol/{claim_id}/run-pipeline — re-run pipeline manually
"""

import os, shutil, uuid, json, imghdr, zipfile
from io import BytesIO
from datetime import datetime, date
from typing import Optional, List

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
)
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database.connection import get_db
from app.models.models import Claim, PipelineTrace, FNOLSubmission
from app.controllers.auth_controller import get_current_user, User
from app.agents import a1_orchestrator
from app.core.config import settings
from app.controllers.policy_controller import _extract_text

router = APIRouter(prefix="/fnol", tags=["FNOL & Pipeline"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Upload guardrails
MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".txt", ".doc", ".docx"}


def _validate_upload(content: bytes, filename: str) -> None:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    if len(content) == 0:
        raise HTTPException(400, "Uploaded file is empty")

    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            400,
            f"File too large. Max allowed size is {MAX_UPLOAD_SIZE // (1024*1024)} MB",
        )

    # Basic PDF check
    if ext == ".pdf":
        if not content.startswith(b"%PDF"):
            raise HTTPException(400, "Invalid PDF file")

    # Basic image check
    if ext in (".jpg", ".jpeg", ".png"):
        kind = imghdr.what(None, h=content)
        if kind not in ("jpeg", "png"):
            raise HTTPException(400, "Uploaded image is not a valid JPEG/PNG")

    # Basic docx check (zip with content types)
    if ext == ".docx":
        try:
            bio = BytesIO(content)
            if not zipfile.is_zipfile(bio):
                raise HTTPException(400, "Invalid DOCX file")
            z = zipfile.ZipFile(bio)
            if "[Content_Types].xml" not in z.namelist():
                raise HTTPException(400, "Invalid DOCX file")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "Invalid DOCX file")


# ── Schemas ────────────────────────────────────────────────────
class FNOLFormPayload(BaseModel):
    policy_id: int
    incident_date: date
    claim_type: str
    channel: str = "web"
    incident_description: str
    incident_location: Optional[str] = None
    contact_phone: Optional[str] = None
    temp_file_path: Optional[str] = None  # path saved during extract-from-doc


class PipelineStepOut(BaseModel):
    step: str
    status: str
    ms: int
    result: dict


# ── Helpers ────────────────────────────────────────────────────
def _make_claim_number() -> str:
    import random, string

    return (
        "CLM-"
        + datetime.utcnow().strftime("%Y")
        + "-"
        + "".join(random.choices(string.digits, k=4))
    )


def _create_and_run(db, user, payload_dict, fnol_payload, file_paths=None):
    """Create claim record then run A1 orchestrator pipeline."""
    # 1. Create claim
    claim = Claim(
        claim_number=_make_claim_number(),
        policy_id=payload_dict["policy_id"],
        claimant_id=user.id,
        incident_date=payload_dict["incident_date"],
        incident_description=payload_dict.get("incident_description", ""),
        claim_type=payload_dict["claim_type"],
        channel=payload_dict.get("channel", "web"),
        status="fnol_received",
    )
    db.add(claim)
    db.flush()  # get claim.id

    # 1b. Persist FNOL submission record (stores file path for later viewing)
    raw_path = (file_paths[0] if file_paths else None) or payload_dict.get(
        "temp_file_path"
    )
    fnol_sub = FNOLSubmission(
        claim_id=claim.id,
        raw_input_type=fnol_payload.get("input_type", "form"),
        raw_input_path=raw_path,
        ocr_text=(
            fnol_payload.get("raw_text", "")[:4000]
            if fnol_payload.get("raw_text")
            else None
        ),
        intake_status="processed",
    )
    db.add(fnol_sub)

    # 2. Run A1 orchestrator
    result = a1_orchestrator.run_pipeline(db, claim, fnol_payload, file_paths)

    # 3. Persist pipeline trace
    trace_rec = (
        db.query(PipelineTrace).filter(PipelineTrace.claim_id == claim.id).first()
    )
    if not trace_rec:
        trace_rec = PipelineTrace(claim_id=claim.id)
        db.add(trace_rec)
    trace_rec.outcome = result["outcome"]
    trace_rec.outcome_msg = result["outcome_msg"]
    trace_rec.elapsed_ms = result["elapsed_ms"]
    trace_rec.trace = result["pipeline_trace"]
    trace_rec.ran_at = datetime.utcnow()

    # 4. Generate notifications
    from app.models.models import Notification as DBNotification, User as DBUser

    # Notify Claimant
    claimant_notif = DBNotification(
        user_id=claim.claimant_id,
        title=f"Claim Submitted: {claim.claim_number}",
        message=f"Your {claim.claim_type.replace('_', ' ').title()} claim has been initiated successfully on {claim.incident_date}.",
        claim_id=claim.id,
        is_read=False,
    )
    db.add(claimant_notif)

    # Notify all upper personas
    upper_users = db.query(DBUser).filter(DBUser.role != "policyholder").all()
    for u in upper_users:
        u_notif = DBNotification(
            user_id=u.id,
            title=f"New Claim Submitted: {claim.claim_number}",
            message=f"Date: {claim.incident_date}\nType: {claim.claim_type.replace('_', ' ').title()}\nPolicyholder: {user.full_name}\n\nSummary:\n{claim.incident_description}",
            claim_id=claim.id,
            is_read=False,
        )
        db.add(u_notif)

    db.commit()

    return result


# ── Route 1: Structured Form ───────────────────────────────────
@router.post("/submit", summary="Option 1 — Structured Form Fill")
def submit_fnol_form(
    payload: FNOLFormPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can submit FNOL")

    pd = payload.model_dump()
    # Pass temp_file_path (from extract-from-doc) so it gets saved in FNOLSubmission
    file_paths = (
        [pd["temp_file_path"]]
        if pd.get("temp_file_path") and os.path.exists(pd["temp_file_path"])
        else None
    )

    # Map to valid DB ENUM: ('form','email','voice','image','pdf')
    if file_paths:
        ext = os.path.splitext(file_paths[0])[1].lower()
        input_type = (
            "pdf"
            if ext == ".pdf"
            else "image" if ext in (".jpg", ".jpeg", ".png") else "form"
        )
    else:
        input_type = "form"

    fnol_payload = {
        "input_type": input_type,
        "entities": {
            "incident_location": pd.get("incident_location"),
            "contact_phone": pd.get("contact_phone"),
        },
    }
    return _create_and_run(db, current_user, pd, fnol_payload, file_paths)


# ── Route 1b: AI Document Extraction ──────────────────────────
@router.post(
    "/extract-from-doc", summary="Extract claim details from uploaded document using AI"
)
async def extract_claim_from_doc(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a claim document (PDF/image/text) and let Mistral AI extract structured claim fields."""
    if current_user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can use this endpoint")

    # Read and validate uploaded file
    ext = os.path.splitext(file.filename)[1].lower() or ".pdf"
    content = await file.read()
    _validate_upload(content, file.filename)

    # Save temp file
    fname = f"temp_{uuid.uuid4()}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(content)

    try:
        # Extract text from document
        raw_text = _extract_text(fpath, ext)
        if not raw_text:
            raw_text = content.decode("utf-8", errors="ignore")

        truncated = raw_text[:6000]

        if not settings.MISTRAL_API_KEY:
            # Fallback mock
            return {
                "claim_type": "medical",
                "incident_date": str(date.today()),
                "incident_description": "AI extraction unavailable. Please fill manually.",
                "incident_location": "",
                "channel": "web",
                "extracted": False,
            }

        prompt = """You are a Claims Intake AI. Analyze the provided claim document and extract the following information.

Return ONLY valid JSON with these exact fields:
{
  "claim_type": "<one of: auto_accident, property_damage, theft, medical, weather, other>",
  "incident_date": "<YYYY-MM-DD format, best estimate from document>",
  "incident_description": "<2-4 sentence summary of what happened, the diagnosis or damage, and treatment/repair>",
  "incident_location": "<city/location if mentioned, else empty string>",
  "channel": "web"
}

Rules:
- claim_type must EXACTLY match one of the allowed values
- incident_date must be a valid ISO date string (YYYY-MM-DD)
- If information is missing, use sensible defaults
- incident_description must be specific and informative"""

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.MISTRAL_API_KEY.strip()}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "mistral-small-latest",
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": f"CLAIM DOCUMENT:\n{truncated}"},
                    ],
                },
            )
            resp.raise_for_status()
            extracted = json.loads(resp.json()["choices"][0]["message"]["content"])

        # Validate and normalise claim_type
        valid_types = {
            "auto_accident",
            "property_damage",
            "theft",
            "medical",
            "weather",
            "other",
        }
        if extracted.get("claim_type") not in valid_types:
            extracted["claim_type"] = "other"

        # Validate date
        try:
            date.fromisoformat(extracted.get("incident_date", ""))
        except Exception:
            extracted["incident_date"] = str(date.today())

        extracted["extracted"] = True
        extracted["temp_file_path"] = fpath  # kept for later submission
        return extracted

    except httpx.HTTPStatusError as e:
        import logging

        logging.getLogger(__name__).error(
            f"Mistral extraction failed: {e.response.text}"
        )
        return {
            "claim_type": "other",
            "incident_date": str(date.today()),
            "incident_description": "Could not auto-extract. Please review and fill manually.",
            "incident_location": "",
            "channel": "web",
            "extracted": False,
            "temp_file_path": fpath,
        }
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Extraction error: {e}")
        return {
            "claim_type": "other",
            "incident_date": str(date.today()),
            "incident_description": "Could not auto-extract. Please review and fill manually.",
            "incident_location": "",
            "channel": "web",
            "extracted": False,
            "temp_file_path": fpath,
        }


# ── Route 2: Document / PDF Upload ────────────────────────────
@router.post("/upload-doc", summary="Option 2 — Document / PDF Upload")
async def upload_document(
    policy_id: int = Form(...),
    claim_type: str = Form(...),
    incident_date: str = Form(...),
    channel: str = Form("web"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can submit FNOL")

    # Read, validate and save uploaded file
    ext = os.path.splitext(file.filename)[1].lower()
    content = await file.read()
    _validate_upload(content, file.filename)
    fname = f"{uuid.uuid4()}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(content)

    # Simulate OCR text extraction (stub)
    ocr_text = f"[OCR stub] Extracted from {file.filename}. Content analysis pending."

    pd = {
        "policy_id": policy_id,
        "incident_date": date.fromisoformat(incident_date),
        "claim_type": claim_type,
        "channel": channel,
        "incident_description": ocr_text[:500],
    }
    fnol_payload = {
        "input_type": "document",
        "raw_text": ocr_text,
        "file_path": fpath,
    }
    return _create_and_run(db, current_user, pd, fnol_payload, [fpath])


# ── Route 3: Photo Upload ─────────────────────────────────────
@router.post("/upload-photo", summary="Option 5 — Damage Photo Upload")
async def upload_photos(
    policy_id: int = Form(...),
    claim_type: str = Form(...),
    incident_date: str = Form(...),
    incident_description: str = Form(""),
    channel: str = Form("web"),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can submit FNOL")

    saved_paths = []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        content = await f.read()
        _validate_upload(content, f.filename)
        fname = f"{uuid.uuid4()}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)
        with open(fpath, "wb") as out:
            out.write(content)
        saved_paths.append(fpath)

    pd = {
        "policy_id": policy_id,
        "incident_date": date.fromisoformat(incident_date),
        "claim_type": claim_type,
        "channel": channel,
        "incident_description": incident_description
        or f"Photo-based claim. {len(saved_paths)} photo(s) uploaded.",
    }
    fnol_payload = {
        "input_type": "image",
        "raw_text": f"[CV stub] {len(saved_paths)} damage photo(s) uploaded for analysis.",
        "file_path": saved_paths[0] if saved_paths else None,
    }
    return _create_and_run(db, current_user, pd, fnol_payload, saved_paths)


# ── Route 4: Get pipeline trace ───────────────────────────────
@router.get("/{claim_id}/pipeline", summary="Get pipeline trace for a claim")
def get_pipeline(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(404, "Claim not found")
    if current_user.role == "policyholder" and claim.claimant_id != current_user.id:
        raise HTTPException(403, "Access denied")

    trace = db.query(PipelineTrace).filter(PipelineTrace.claim_id == claim_id).first()
    if not trace:
        return {"claim_id": claim_id, "pipeline_trace": [], "outcome": "not_run"}

    return {
        "claim_id": claim_id,
        "claim_number": claim.claim_number,
        "claim_status": claim.status,
        "outcome": trace.outcome,
        "outcome_msg": trace.outcome_msg,
        "elapsed_ms": trace.elapsed_ms,
        "pipeline_trace": trace.trace or [],
        "ran_at": str(trace.ran_at),
    }


# ── Route 5: Re-run pipeline (admin / adjuster use) ──────────
@router.post("/{claim_id}/run-pipeline", summary="Re-run pipeline for existing claim")
def rerun_pipeline(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("adjuster", "supervisor", "it_ops"):
        raise HTTPException(403, "Access denied")

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(404, "Claim not found")

    fnol_payload = {"input_type": "form"}
    result = a1_orchestrator.run_pipeline(db, claim, fnol_payload)

    trace_rec = (
        db.query(PipelineTrace).filter(PipelineTrace.claim_id == claim.id).first()
    )
    if not trace_rec:
        trace_rec = PipelineTrace(claim_id=claim.id)
        db.add(trace_rec)
    trace_rec.outcome = result["outcome"]
    trace_rec.outcome_msg = result["outcome_msg"]
    trace_rec.elapsed_ms = result["elapsed_ms"]
    trace_rec.trace = result["pipeline_trace"]
    trace_rec.ran_at = datetime.utcnow()
    db.commit()
    return result
