import os, string, random
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta

from app.database.connection import get_db
from app.models.models import Claim, Policy, User, FNOLSubmission, ClaimDocument
from app.controllers.auth_controller import get_current_user
from app.services.email_escalation_service import notify_claimant_update

router = APIRouter(prefix="/claims", tags=["Claims"])


# ── Schemas ───────────────────────────────────────────────────
class ClaimOut(BaseModel):
    id: int
    policy_id: int
    claim_number: str
    claim_type: str
    status: str
    priority: str | None = None
    channel: str | None = None
    incident_date: date
    incident_description: str | None = None
    auto_settle_eligible: bool | None = False
    created_at: datetime | None = None
    document_url: str | None = None
    adjuster_recommended_action: str | None = None
    adjuster_recommended_amount: float | None = None
    adjuster_recommended_notes: str | None = None
    policy_coverage_limit: float | None = None
    policy_total_settled_amount: float | None = None
    policy_remaining_capacity: float | None = None
    document_request_count: int | None = 0
    document_request_message: str | None = None
    document_request_by_role: str | None = None
    status_before_doc_request: str | None = None

    class Config:
        from_attributes = True


class ClaimDocumentOut(BaseModel):
    id: int
    claim_id: Optional[int] = None
    policy_id: int
    user_id: int
    filename: str
    category: str
    created_at: datetime

    class Config:
        from_attributes = True


class ClaimCreate(BaseModel):
    policy_id: int
    incident_date: date
    incident_description: str
    claim_type: str
    channel: str = "web"


class ClaimDecisionPayload(BaseModel):
    action: str  # "approve" | "reject" | "partial_approve"
    notes: Optional[str] = None
    amount: Optional[float] = None


class RequestDocumentsPayload(BaseModel):
    message: str


class ClaimDecisionOut(BaseModel):
    claim_id: int
    claim_number: str
    action: str
    new_status: str
    payment_ref: Optional[str] = None
    message: str


# ── Helper ────────────────────────────────────────────────────
def _next_bday(dt: datetime, n: int) -> datetime:
    d, c = dt, 0
    while c < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            c += 1
    return d


# ── Routes ────────────────────────────────────────────────────
@router.get("/", response_model=List[ClaimOut])
def list_claims(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Claim)
    # Policyholders only see their own claims
    if current_user.role == "policyholder":
        q = q.filter(Claim.claimant_id == current_user.id)
    # Adjuster sees only escalated_adjuster
    elif current_user.role == "adjuster":
        q = q.filter(Claim.status == "escalated_adjuster")
    # SIU sees only escalated_siu
    elif current_user.role == "siu_investigator":
        q = q.filter(Claim.status == "escalated_siu")
    if status:
        q = q.filter(Claim.status == status)
    return q.offset(offset).limit(limit).all()


@router.get("/{claim_id}", response_model=ClaimOut)
def get_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    # Attach document_url if an FNOL submission with a file exists
    fnol = db.query(FNOLSubmission).filter(FNOLSubmission.claim_id == claim_id).first()
    doc_url = None
    if fnol and fnol.raw_input_path and os.path.exists(fnol.raw_input_path):
        doc_url = f"/api/claims/{claim_id}/document"
        
    policy = db.query(Policy).filter(Policy.id == claim.policy_id).first()
    coverage_limit = float(policy.coverage_limit or 0) if policy else 0.0
    
    from sqlalchemy import func
    from app.models.models import Settlement
    total_settled = db.query(func.sum(Settlement.net_payout)).join(Claim, Claim.id == Settlement.claim_id).filter(
        Claim.policy_id == claim.policy_id,
        Claim.status == "settled"
    ).scalar() or 0.0
    total_settled = float(total_settled)
    remaining_capacity = max(0.0, coverage_limit - total_settled)
    
    # Build response manually to include extra fields
    out = ClaimOut.model_validate(claim)
    out.incident_description = claim.incident_description
    out.document_url = doc_url
    out.policy_coverage_limit = coverage_limit
    out.policy_total_settled_amount = total_settled
    out.policy_remaining_capacity = remaining_capacity
    return out


@router.post("/{claim_id}/decision", response_model=ClaimDecisionOut)
def claim_decision(
    claim_id: int,
    payload: ClaimDecisionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adjuster / SIU / Supervisor: approve (settle) or reject a claim."""
    ALLOWED = {"adjuster", "siu_investigator", "supervisor", "admin"}
    if current_user.role not in ALLOWED:
        raise HTTPException(403, "Only adjuster / SIU / supervisor can make decisions")

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(404, "Claim not found")

    if claim.status not in (
        "escalated_adjuster",
        "escalated_siu",
        "settlement_pending",
    ):
        raise HTTPException(
            400, f"Claim is in '{claim.status}' — decision not applicable"
        )

    if payload.action not in ("approve", "reject", "partial_approve"):
        raise HTTPException(422, "action must be 'approve', 'reject', or 'partial_approve'")

    if payload.action == "partial_approve":
        if payload.amount is None or payload.amount <= 0:
            raise HTTPException(400, "For partial approval, a positive amount must be specified")

    # Enforce role-based status constraints
    if current_user.role == "adjuster" and claim.status != "escalated_adjuster":
        raise HTTPException(400, "Adjusters can only review claims with 'escalated_adjuster' status.")
    elif current_user.role == "siu_investigator" and claim.status != "escalated_siu":
        raise HTTPException(400, "SIU Investigators can only review claims with 'escalated_siu' status.")

    from app.models.models import Settlement, Notification

    # Adjuster recommendation workflow: do not finalize, escalate to SIU instead.
    if current_user.role == "adjuster":
        claim.adjuster_recommended_action = payload.action
        claim.adjuster_recommended_amount = payload.amount
        claim.adjuster_recommended_notes = payload.notes
        claim.status = "escalated_siu"

        # Reset escalation metadata for the new status
        claim.escalation_level = 0
        claim.escalation_started_at = None
        claim.escalation_next_check_at = None
        claim.escalation_last_notified_at = None

        # Notify claimant
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} is undergoing re-verification",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} has been reviewed by the Adjuster. "
                f"The claim has been referred to the SIU investigator for final re-verification. "
                f"You will see the final status once the re-verification is complete.\n"
            ),
            event_type="adjuster_reverify_referral",
            source_status="escalated_siu",
            trigger_reason=payload.notes or "Referred for SIU re-verification.",
        )

        # Notify SIU Investigators via escalation email/notification service
        from app.services.email_escalation_service import notify_claim_escalation
        notify_claim_escalation(db, claim)

        db.commit()

        return ClaimDecisionOut(
            claim_id=claim.id,
            claim_number=claim.claim_number,
            action=payload.action,
            new_status="escalated_siu",
            payment_ref=None,
            message="Adjuster recommendation submitted. Claim referred to SIU Investigator for re-verification.",
        )

    # For SIU / Supervisor / Admin, execute final settlement/rejection decision
    now = datetime.utcnow()
    pay_ref = None

    if payload.action in ("approve", "partial_approve"):
        pay_ref = (
            "PAY-"
            + now.strftime("%Y%m%d")
            + "-"
            + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
        )
        exp_by = _next_bday(now, 3)

        settlement = (
            db.query(Settlement).filter(Settlement.claim_id == claim_id).first()
        )
        if not settlement:
            settlement = Settlement(claim_id=claim_id)
            db.add(settlement)

        settlement.payment_reference = pay_ref
        settlement.payment_status = "completed"
        settlement.payment_method = "bank_transfer"
        settlement.approved_by = current_user.id
        settlement.settled_at = now
        
        if payload.action == "partial_approve":
            settlement.net_payout = round(payload.amount, 2)
            settlement.gross_amount = round(payload.amount, 2)
            settlement.deductible_deducted = 0.00
        else:
            if not settlement.net_payout:
                settlement.net_payout = 0

        claim.status = "settled"
        claim.closed_at = now
        new_status = "settled"
        
        if payload.action == "partial_approve":
            msg = (
                f"Claim partially approved by {current_user.full_name} for ₹{settlement.net_payout:,.2f}. "
                f"Payment {pay_ref} initiated — expected by {exp_by.strftime('%d %b %Y')}."
            )
            # Send partial approval email
            notify_claimant_update(
                db,
                claim,
                subject=f"Claim {claim.claim_number} was partially approved",
                body=(
                    f"Hello,\n\n"
                    f"Your claim {claim.claim_number} was partially approved after manual review for an amount of ₹{settlement.net_payout:,.2f}.\n"
                    f"Please find the details in your dashboard.\n"
                ),
                event_type="manual_partial_approve",
                source_status="settled",
                trigger_reason=payload.notes or "Partially approved after manual review.",
            )
        else:
            msg = (
                f"Claim approved by {current_user.full_name}. "
                f"Payment {pay_ref} initiated — expected by {exp_by.strftime('%d %b %Y')}."
            )
            # Send approval email
            notify_claimant_update(
                db,
                claim,
                subject=f"Claim {claim.claim_number} was approved",
                body=(
                    f"Hello,\n\n"
                    f"Your claim {claim.claim_number} has been fully approved and settled.\n"
                    f"Please find the payment details in your dashboard.\n"
                ),
                event_type="manual_approve",
                source_status="settled",
                trigger_reason=payload.notes or "Approved after manual review.",
            )
    else:
        claim.status = "rejected"
        claim.closed_at = now
        new_status = "rejected"
        reason = payload.notes or "Rejected after manual review."
        msg = f"Claim rejected by {current_user.full_name}. Reason: {reason}"
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} was rejected",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} was rejected after manual review.\n"
                f"Please see the reason below and contact support if you need more information.\n"
            ),
            event_type="manual_reject",
            source_status="rejected",
            trigger_reason=reason,
        )

    # Notify claimant
    if payload.action == "partial_approve":
        title = f"⚠️ Claim {claim.claim_number} Partially Approved"
    elif payload.action == "approve":
        title = f"✅ Claim {claim.claim_number} Approved"
    else:
        title = f"❌ Claim {claim.claim_number} Rejected"

    db.add(
        Notification(
            user_id=claim.claimant_id,
            title=title,
            message=msg,
            claim_id=claim.id,
            is_read=False,
        )
    )
    db.commit()

    return ClaimDecisionOut(
        claim_id=claim.id,
        claim_number=claim.claim_number,
        action=payload.action,
        new_status=new_status,
        payment_ref=pay_ref,
        message=msg,
    )


@router.get("/{claim_id}/document", summary="Download/view the uploaded claim document")
def get_claim_document(
    claim_id: int,
    download: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(404, "Claim not found")
    if current_user.role == "policyholder" and claim.claimant_id != current_user.id:
        raise HTTPException(403, "Access denied")
    fnol = db.query(FNOLSubmission).filter(FNOLSubmission.claim_id == claim_id).first()
    if not fnol or not fnol.raw_input_path:
        raise HTTPException(404, "No document attached to this claim")
    fpath = fnol.raw_input_path
    if not os.path.exists(fpath):
        raise HTTPException(404, "Document file not found on server")
    ext = os.path.splitext(fpath)[1].lower()
    media_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".txt": "text/plain",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_map.get(ext, "application/octet-stream")
    filename = f"claim_{claim.claim_number}{ext}"
    return FileResponse(
        path=fpath,
        media_type=media_type,
        filename=filename,
        content_disposition_type="attachment" if download else "inline",
    )


@router.post("/", response_model=ClaimOut, status_code=201)
def create_claim(
    payload: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "policyholder":
        raise HTTPException(
            status_code=403, detail="Only policyholders can file claims"
        )
    claim_number = (
        "CLM-"
        + datetime.utcnow().strftime("%Y")
        + "-"
        + "".join(random.choices(string.digits, k=4))
    )
    claim = Claim(
        claim_number=claim_number,
        policy_id=payload.policy_id,
        claimant_id=current_user.id,
        incident_date=payload.incident_date,
        incident_description=payload.incident_description,
        claim_type=payload.claim_type,
        channel=payload.channel,
        status="fnol_received",
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)
    return claim


@router.get("/{claim_id}/documents", response_model=List[ClaimDocumentOut])
def list_claim_documents(
    claim_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if current_user.role == "policyholder" and claim.claimant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    docs = db.query(ClaimDocument).filter(ClaimDocument.claim_id == claim_id).all()
    return docs


@router.get("/{claim_id}/documents/{document_id}", summary="Download/view a specific claim document")
def get_specific_claim_document(
    claim_id: int,
    document_id: int,
    download: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if current_user.role == "policyholder" and claim.claimant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    doc = db.query(ClaimDocument).filter(
        ClaimDocument.id == document_id,
        ClaimDocument.claim_id == claim_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    fpath = doc.file_path
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Document file not found on server")
        
    ext = os.path.splitext(fpath)[1].lower()
    media_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".txt": "text/plain",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_map.get(ext, "application/octet-stream")
    return FileResponse(
        path=fpath,
        media_type=media_type,
        filename=doc.filename,
        content_disposition_type="attachment" if download else "inline",
    )


@router.post("/{claim_id}/request-documents", response_model=ClaimOut)
def request_more_documents(
    claim_id: int,
    payload: RequestDocumentsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ALLOWED = {"adjuster", "siu_investigator", "supervisor", "admin"}
    if current_user.role not in ALLOWED:
        raise HTTPException(status_code=403, detail="Access denied")

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    current_count = claim.document_request_count or 0
    if current_count >= 3:
        # Escalate directly to SIU Investigator
        claim.status = "escalated_siu"
        claim.escalation_level = 0
        claim.escalation_started_at = None
        claim.escalation_next_check_at = None
        claim.escalation_last_notified_at = None
        claim.document_request_message = None

        db.commit()

        # Notify claimant via email
        notify_claimant_update(
            db,
            claim,
            subject=f"Claim {claim.claim_number} escalated to SIU",
            body=(
                f"Hello,\n\n"
                f"Your claim {claim.claim_number} has exceeded the maximum number of document requests (3) "
                f"and has been escalated to the SIU investigator for manual investigation and re-verification.\n"
            ),
            event_type="siu_escalation_limit_exceeded",
            source_status="escalated_siu",
            trigger_reason="Maximum document request limit reached (3 times)."
        )

        # Trigger email to SIU Investigator
        from app.services.email_escalation_service import notify_claim_escalation
        notify_claim_escalation(db, claim)

        db.commit()
        return claim

    claim.status_before_doc_request = claim.status
    claim.status = "documents_required"
    claim.document_request_message = payload.message
    claim.document_request_by_role = current_user.role
    claim.document_request_count = current_count + 1

    db.commit()

    # Send email to policyholder
    notify_claimant_update(
        db,
        claim,
        subject=f"Action Required: Documents needed for claim {claim.claim_number}",
        body=(
            f"Hello,\n\n"
            f"The claims reviewer has requested additional documents to process your claim {claim.claim_number}.\n\n"
            f"Request Details:\n"
            f"\"{payload.message}\"\n\n"
            f"Please upload the required documents through your claims portal as soon as possible to proceed with your claim.\n"
        ),
        event_type=f"document_request_{claim.document_request_count}",
        source_status="documents_required",
        trigger_reason=payload.message
    )

    db.commit()
    return claim


@router.post("/{claim_id}/upload-more-documents", response_model=ClaimOut)
async def upload_more_documents(
    claim_id: int,
    files: List[UploadFile] = File(default=[]),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "policyholder":
        raise HTTPException(status_code=403, detail="Only policyholders can upload documents")

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status != "documents_required":
        raise HTTPException(status_code=400, detail="Documents are not currently requested for this claim")

    uploaded_files = []
    if files:
        uploaded_files.extend(files)
    if file:
        uploaded_files.append(file)

    if not uploaded_files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Import validation, extraction and config helpers
    from app.controllers.fnol_controller import UPLOAD_DIR, _validate_upload
    from app.controllers.policy_controller import _extract_text
    from app.core.config import settings
    import uuid
    import httpx
    import json

    saved_paths = []
    combined_text = ""
    saved_files_info = []

    for f in uploaded_files:
        ext = os.path.splitext(f.filename)[1].lower() or ".pdf"
        content = await f.read()
        _validate_upload(content, f.filename)

        fname = f"temp_{uuid.uuid4()}{ext}"
        fpath = os.path.join(UPLOAD_DIR, fname)
        with open(fpath, "wb") as out:
            out.write(content)
        saved_paths.append(fpath)

        raw_text = _extract_text(fpath, ext)
        if not raw_text:
            raw_text = content.decode("utf-8", errors="ignore")

        saved_files_info.append({
            "filename": f.filename,
            "fpath": fpath,
            "ext": ext,
            "raw_text": raw_text
        })
        combined_text += f"\n--- DOCUMENT: {f.filename} ---\n{raw_text}\n"

    # Classify files category
    categories_by_filename = {}
    if settings.MISTRAL_API_KEY:
        prompt = """You are a Claims intake helper. Given list of filenames and their snippets, classify each file into one of: 'claim_form', 'medical_report', 'test_report', 'id_card', 'other'.
        Return JSON object with "documents": [{"filename": "...", "category": "..."}]"""
        try:
            truncated = combined_text[:4000]
            async with httpx.AsyncClient(timeout=30.0) as client:
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
                            {"role": "user", "content": truncated},
                        ],
                    },
                )
                if resp.status_code == 200:
                    res_json = resp.json()
                    docs_extracted = json.loads(res_json["choices"][0]["message"]["content"]).get("documents", [])
                    for d in docs_extracted:
                        categories_by_filename[d["filename"].lower()] = d.get("category", "other")
        except Exception:
            pass

    # Save to ClaimDocument DB
    for info in saved_files_info:
        cat = categories_by_filename.get(info["filename"].lower(), "other")
        if cat not in ("claim_form", "medical_report", "test_report", "id_card", "other"):
            cat = "other"

        claim_doc = ClaimDocument(
            claim_id=claim.id,
            policy_id=claim.policy_id,
            user_id=current_user.id,
            filename=info["filename"],
            file_path=info["fpath"],
            category=cat,
            raw_text=info["raw_text"],
            extracted_data={}
        )
        db.add(claim_doc)

    # Revert back status or fallback
    back_status = claim.status_before_doc_request or "escalated_adjuster"
    if back_status in ("documents_required", "fnol_received", "settled", "rejected", "closed"):
        back_status = "escalated_adjuster"

    claim.status = back_status
    claim.status_before_doc_request = None
    claim.document_request_message = None

    db.commit()
    db.refresh(claim)
    return claim
