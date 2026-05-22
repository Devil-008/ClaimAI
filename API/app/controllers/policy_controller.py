"""
Policy Controller — policyholder manages their own policies.

GET  /api/policies/mine            — list logged-in user's policies
GET  /api/policies/{id}            — policy detail
POST /api/policies/add-manual      — manual form
POST /api/policies/upload          — PDF/DOC upload → OCR extraction
POST /api/policies/confirm-upload  — save confirmed extracted fields
DELETE /api/policies/{id}          — remove (if no active claims)
"""

import os, shutil, uuid, re, httpx, json
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database.connection import get_db
from app.models.models import Policy, Claim, FNOLSubmission, FraudRiskScore, DamageAssessment, PipelineTrace, Settlement, AuditLog
from app.controllers.auth_controller import get_current_user, User
from app.core.config import settings

router = APIRouter(prefix="/policies", tags=["Policies"])

UPLOAD_DIR = "uploads/policies"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── Schemas ────────────────────────────────────────────────────
class PolicyManualPayload(BaseModel):
    policy_number:      str
    policy_type:        str
    plan_name:          Optional[str]  = None
    insurance_company:  Optional[str]  = None
    policyholder_name:  Optional[str]  = None
    date_of_birth:      Optional[date] = None
    nominee_name:       Optional[str]  = None
    coverage_type:      Optional[str]  = None
    coverage_limit:     float          = 100_000
    deductible:         float          = 0
    premium:            float          = 0
    effective_date:     date
    expiry_date:        date
    exclusions:         Optional[str]  = None
    benefits:           Optional[str]  = None
    file_path:          Optional[str]  = None   # set by upload flow
    extra_details:      Optional[str]  = None   # JSON string storing standard rich details

# ── Helpers ────────────────────────────────────────────────────
def _policy_out(p: Policy) -> dict:
    extra = None
    if p.extra_details:
        try:
            extra = json.loads(p.extra_details)
        except Exception:
            extra = p.extra_details

    return {
        "id":                 p.id,
        "policy_number":      p.policy_number,
        "policy_type":        p.policy_type,
        "plan_name":          p.plan_name,
        "insurance_company":  p.insurance_company,
        "policyholder_name":  p.policyholder_name,
        "date_of_birth":      str(p.date_of_birth) if p.date_of_birth else None,
        "nominee_name":       p.nominee_name,
        "coverage_type":      p.coverage_type,
        "coverage_limit":     float(p.coverage_limit or 0),
        "deductible":         float(p.deductible or 0),
        "premium":            float(p.premium or 0),
        "effective_date":     str(p.effective_date),
        "expiry_date":        str(p.expiry_date),
        "status":             p.status,
        "exclusions":         p.exclusions,
        "benefits":           p.benefits,
        "extra_details":      extra,
        "file_path":          p.file_path,
        "has_document":       bool(p.file_path and os.path.exists(p.file_path)),
        "created_at":         str(p.created_at),
        "days_to_expiry":     (p.expiry_date - date.today()).days,
        "is_expired":         p.expiry_date < date.today(),
    }

def _ensure_owner(policy: Policy, user: User):
    if policy.policyholder_id != user.id:
        raise HTTPException(403, "Access denied")


# ── PDF/DOC text extraction ───────────────────────────────────
def _read_pdf(path: str) -> str:
    """Extract all text from a PDF using pdfplumber."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        return "\n".join(text_parts)
    except Exception as e:
        return ""


def _read_image_ocr(path: str) -> str:
    """Try pytesseract for images; fall back to empty string if not installed."""
    try:
        from PIL import Image
        import pytesseract
        return pytesseract.image_to_string(Image.open(path))
    except Exception:
        return ""


def _read_text_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


def _extract_text(file_path: str, ext: str) -> str:
    if ext == ".pdf":
        return _read_pdf(file_path)
    elif ext in (".png", ".jpg", ".jpeg", ".tiff", ".bmp"):
        return _read_image_ocr(file_path)
    elif ext in (".txt",):
        return _read_text_file(file_path)
    elif ext in (".doc", ".docx"):
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception:
            return ""
    return ""


# ── Field extraction helpers ──────────────────────────────────
def _find(patterns, text, flags=re.IGNORECASE) -> Optional[str]:
    """Try multiple regex patterns.
    Returns group(1) if present, else group(0) as fallback.
    Never raises IndexError.
    """
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            try:
                return m.group(1).strip()
            except IndexError:
                return m.group(0).strip()
    return None

def _find_amount(patterns, text) -> Optional[float]:
    raw = _find(patterns, text)
    if raw:
        raw = re.sub(r"[₹,\s]", "", raw)
        try:
            return float(raw)
        except Exception:
            pass
    return None

def _find_date(patterns, text) -> Optional[str]:
    raw = _find(patterns, text)
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d %b %Y", "%d-%b-%Y",
                "%d/%b/%Y", "%B %d, %Y", "%d %B %Y", "%d-%m-%y", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


# ── Main extraction engine ────────────────────────────────────
def _extract_policy_fields_regex(text: str, filename: str) -> dict:
    t = text  # keep original case for names
    tl = text.lower()

    # ── Policy number ─────────────────────────────────────────
    policy_number = _find([
        r"policy\s*(?:no|number|#)[.:\s]*([A-Z0-9\-/]{4,30})",
        r"policy\s*id[.:\s]*([A-Z0-9\-/]{4,30})",
        r"(?:certificate|cert)\s*(?:no|number)[.:\s]*([A-Z0-9\-/]{4,30})",
        r"\b(\d{8,12})\b",          # bare 8-12 digit number
    ], t) or f"POL-{uuid.uuid4().hex[:8].upper()}"

    # ── Plan / product name ───────────────────────────────────
    plan_name = _find([
        r"(?:plan|product|policy)\s*name[.:\s]+(.{4,80}?)(?:\n|  |\t|$)",
        r"(?:plan|scheme)[.:\s]+(.{4,60}?)(?:\n|  |\t|$)",
        r"(GC\s*\d+[°º]?)",                            # e.g. "GC 360°"
        r"(?:insured\s+under|cover(?:ed)?\s+under)[.:\s]+(.{4,80}?)(?:\n|  |\t)",
    ], t)

    # ── Insurance company ─────────────────────────────────────
    insurance_company = _find([
        r"(?:insurer|insurance\s+company|insured\s+by|underwritten\s+by)[.:\s]+(.{4,80}?)(?:\n|  |\t|$)",
        r"([A-Z][A-Za-z ]+(?:Insurance|Assurance|Life|General|Health)[A-Za-z ]*(?:Limited|Ltd\.?|Corp\.?))",
    ], t)

    # ── Policyholder name ─────────────────────────────────────
    policyholder_name = _find([
        r"(?:policyholder|insured\s*name|name\s*of\s*(?:insured|policyholder))[.:\s]+([A-Za-z][A-Za-z ]{2,60}?)(?:\n|  |\t|$|,)",
        r"(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+([A-Z][A-Za-z ]{2,50})",
        r"Dear\s+([A-Z][A-Za-z ]{2,50})",
    ], t)

    # ── Date of birth ─────────────────────────────────────────
    dob = _find_date([
        r"(?:date\s+of\s+birth|dob|d\.o\.b)[.:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})",
        r"born(?:\s+on)?[.:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",
    ], t)

    # ── Nominee ───────────────────────────────────────────────
    nominee_name = _find([
        r"(?:nominee|beneficiary)[.:\s]+([A-Za-z][A-Za-z ]{2,60}?)(?:\n|  |\t|$|,)",
        r"(Legal\s+Heir)",                              # literal match with capture group
        r"(?:nominee|beneficiary)[.:\s]+((?:[A-Z][a-z]+\s*){1,5})",  # fallback name
    ], t)

    # ── Coverage limit / sum insured ──────────────────────────
    coverage_limit = _find_amount([
        r"(?:sum\s+insured|coverage\s+(?:amount|limit)|insured\s+sum|cover(?:age)?)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
        r"(?:si|sa)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
        r"₹\s*([\d,]+(?:\.\d{1,2})?)(?:\s*/\s*year|\s+(?:per|p\.a\.))?",
    ], t) or 100_000

    # ── Premium ───────────────────────────────────────────────
    premium = _find_amount([
        r"(?:premium|annual\s+premium|total\s+premium)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
        r"(?:payable|due)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
    ], t) or 0

    # ── Effective date ────────────────────────────────────────
    effective_date = _find_date([
        r"(?:effective\s+date|commencement\s+date|start\s+date|policy\s+start|inception\s+date)[.:\s]*(\d{1,2}[-/\s]\w+[-/\s]\d{2,4}|\d{4}-\d{2}-\d{2})",
        r"(?:from|valid\s+from|commencing)[.:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",
    ], t) or str(date.today())

    # ── Expiry date ───────────────────────────────────────────
    expiry_date = _find_date([
        r"(?:expiry\s+date|expiration\s+date|valid\s+(?:till|upto|up\s+to)|maturity\s+date|policy\s+end|end\s+date)[.:\s]*(\d{1,2}[-/\s]\w+[-/\s]\d{2,4}|\d{4}-\d{2}-\d{2})",
        r"(?:to|valid\s+to|expires?)[.:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",
    ], t) or str(date.today().replace(year=date.today().year + 1))

    # ── Deductible ────────────────────────────────────────────
    deductible = _find_amount([
        r"(?:deductible|excess|co-pay(?:ment)?)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
    ], t) or 0

    # ── Policy type inference ─────────────────────────────────
    if   any(w in tl for w in ["auto","vehicle","motor","car","two-wheeler"])   : ptype = "auto"
    elif any(w in tl for w in ["property","home","house","building","fire"])    : ptype = "property"
    elif any(w in tl for w in ["health","medical","hospitali","critical illness", "care health"]): ptype = "health"
    elif any(w in tl for w in ["life","term","endowment","whole life","ulip"])  : ptype = "life"
    elif any(w in tl for w in ["commercial","business","enterprise","marine"])  : ptype = "commercial"
    else                                                                         : ptype = "health"  # default for uploaded docs

    # ── Benefits ──────────────────────────────────────────────
    benefits = None
    bm = re.search(
        r"(?:benefit[s]?|coverage\s+detail[s]?|what\s+(?:is|are)\s+covered)[.:\n]+([\s\S]{20,600}?)(?:\nexclusion|\nwaiting|\n\n|$)",
        t, re.IGNORECASE
    )
    if bm:
        benefits = bm.group(1).strip()[:600]

    # ── Exclusions ────────────────────────────────────────────
    exclusions = None
    em = re.search(
        r"(?:exclusion[s]?|not\s+covered|exception[s]?)[.:\n]+([\s\S]{20,600}?)(?:\n\n|\nwait|\nben|$)",
        t, re.IGNORECASE
    )
    if em:
        exclusions = em.group(1).strip()[:600]

    return {
        "policy_number":     policy_number,
        "policy_type":       ptype,
        "plan_name":         plan_name,
        "insurance_company": insurance_company,
        "policyholder_name": policyholder_name,
        "date_of_birth":     dob,
        "nominee_name":      nominee_name,
        "coverage_type":     plan_name or ptype.title(),
        "coverage_limit":    coverage_limit,
        "premium":           premium,
        "deductible":        deductible,
        "effective_date":    effective_date,
        "expiry_date":       expiry_date,
        "benefits":          benefits,
        "exclusions":        exclusions,
        "extraction_confidence": "high" if plan_name and policyholder_name else "medium",
        "note":              "Fields auto-extracted from PDF — please review and correct if needed.",
    }


async def _extract_policy_fields(text: str, filename: str) -> dict:
    """Extract standard comprehensive policy details using Mistral API with regex fallback."""
    # 1. Start with regex extraction as guaranteed baseline fallback
    fallback = _extract_policy_fields_regex(text, filename)

    # Standardized rich format
    standard_data = {
        "policy_number": fallback.get("policy_number", ""),
        "policyholder_name": fallback.get("policyholder_name", ""),
        "date_of_birth": fallback.get("date_of_birth", ""),
        "insurance_company": fallback.get("insurance_company", ""),
        "policy_type": fallback.get("policy_type", "health"),
        "plan_name": fallback.get("plan_name", ""),
        "cover_type": fallback.get("coverage_type", "Individual"),
        "sum_insured": fallback.get("coverage_limit", 100000.0),
        "premium_amount": fallback.get("premium", 0.0),
        "premium_frequency": "annual",
        "deductible_amount": fallback.get("deductible", 0.0),
        "co_pay_percentage": 0.0,
        "effective_date": fallback.get("effective_date", ""),
        "expiry_date": fallback.get("expiry_date", ""),
        "renewal_date": "",
        "policy_status": "active",
        "insured_members": [],
        "nominee_name": fallback.get("nominee_name", ""),
        "nominee_relationship": "",
        "benefits": fallback.get("benefits", "").split("\n") if fallback.get("benefits") else [],
        "exclusions": fallback.get("exclusions", "").split("\n") if fallback.get("exclusions") else [],
        "waiting_periods": [],
        "pre_existing_disease_waiting_months": 0,
        "network_hospital_required": False,
        "claim_contact": {},
        "grievance_contact": {},
        "documents_required_for_claim": [],
        "risk_indicators": [],
        "source_document_name": filename,
        "extraction_confidence": 0.5
    }

    if not settings.MISTRAL_API_KEY:
        # Save standard_data serialization to extra_details key for backward-compatibility
        standard_data["extra_details"] = json.dumps(standard_data)
        return standard_data

    prompt = f"""You are a professional insurance policy parser. Extract all structured details from the text of the policy document below.
Return a valid, parsed JSON object matching the schema below exactly. Do not include any markdown backticks, explanations, or wrapper tags.

REQUIRED JSON SCHEMA:
{{
  "policy_number": "string",
  "policyholder_name": "string",
  "insurance_company": "string",
  "policy_type": "auto | property | health | life | commercial",
  "plan_name": "string",
  "cover_type": "string (e.g. Individual, Family Floater)",
  "sum_insured": float (total coverage amount or sum insured),
  "premium_amount": float,
  "premium_frequency": "string (e.g. annual, monthly)",
  "deductible_amount": float,
  "co_pay_percentage": float (e.g. 10.0 for 10% co-pay),
  "effective_date": "string (format YYYY-MM-DD)",
  "expiry_date": "string (format YYYY-MM-DD)",
  "renewal_date": "string (format YYYY-MM-DD)",
  "policy_status": "active | expired",
  "insured_members": ["string"],
  "nominee_name": "string",
  "nominee_relationship": "string",
  "benefits": ["string"],
  "exclusions": ["string"],
  "waiting_periods": ["string"],
  "pre_existing_disease_waiting_months": int,
  "network_hospital_required": boolean,
  "claim_contact": {{"phone": "string", "email": "string", "address": "string"}},
  "grievance_contact": {{"phone": "string", "email": "string"}},
  "documents_required_for_claim": ["string"],
  "risk_indicators": ["string"],
  "source_document_name": "{filename}",
  "extraction_confidence": float (between 0.0 and 1.0)
}}

POLICY TEXT:
{text[:8000]}
"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {settings.MISTRAL_API_KEY.strip()}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "mistral-small-latest",
                "messages": [
                    {"role": "system", "content": "You are a specialized document extraction service that only returns pure JSON matching the requested schema."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            resp = await client.post("https://api.mistral.ai/v1/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            content = resp.json()['choices'][0]['message']['content'].strip()
            
            # Clean possible markdown blocks
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            extracted_json = json.loads(content)
            for key in standard_data.keys():
                if key in extracted_json:
                    standard_data[key] = extracted_json[key]
            
            # Type safety post-processing
            standard_data["sum_insured"] = float(standard_data["sum_insured"] or 0)
            standard_data["premium_amount"] = float(standard_data["premium_amount"] or 0)
            standard_data["deductible_amount"] = float(standard_data["deductible_amount"] or 0)
            standard_data["co_pay_percentage"] = float(standard_data["co_pay_percentage"] or 0)
            standard_data["pre_existing_disease_waiting_months"] = int(standard_data["pre_existing_disease_waiting_months"] or 0)
            standard_data["network_hospital_required"] = bool(standard_data["network_hospital_required"])
            standard_data["extraction_confidence"] = float(standard_data["extraction_confidence"] or 0.8)
            
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to extract policy fields via Mistral: {e}")

    # 1. Normalize policy_type to strict DB Enum values
    pt = str(standard_data.get("policy_type") or "health").lower()
    if "auto" in pt or "vehicle" in pt or "motor" in pt or "car" in pt:
        standard_data["policy_type"] = "auto"
    elif "property" in pt or "home" in pt or "house" in pt or "building" in pt or "fire" in pt:
        standard_data["policy_type"] = "property"
    elif "life" in pt or "term" in pt or "death" in pt:
        standard_data["policy_type"] = "life"
    elif "commercial" in pt or "business" in pt or "enterprise" in pt or "marine" in pt:
        standard_data["policy_type"] = "commercial"
    else:
        standard_data["policy_type"] = "health"

    # 2. Sanitize and format date fields cleanly (YYYY-MM-DD or None)
    for date_key in ["effective_date", "expiry_date", "date_of_birth", "renewal_date"]:
        val = standard_data.get(date_key)
        if val:
            val_str = str(val).strip()
            if val_str.lower() in ("n/a", "null", "none", ""):
                standard_data[date_key] = None
            else:
                parsed = None
                for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%b-%Y",
                            "%d/%b/%Y", "%B %d, %Y", "%d %B %Y", "%d-%m-%y", "%d/%m/%y"):
                    try:
                        parsed = datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        pass
                if parsed:
                    standard_data[date_key] = parsed
                else:
                    standard_data[date_key] = None
        else:
            standard_data[date_key] = None

    # 3. Format list fields as newline-separated strings for Policy manual payload compatibility
    if isinstance(standard_data.get("benefits"), list):
        standard_data["benefits"] = "\n".join(str(b) for b in standard_data["benefits"])
    if isinstance(standard_data.get("exclusions"), list):
        standard_data["exclusions"] = "\n".join(str(e) for e in standard_data["exclusions"])

    # Set backwards compatibility fields
    standard_data["coverage_limit"] = standard_data["sum_insured"]
    standard_data["premium"] = standard_data["premium_amount"]
    standard_data["deductible"] = standard_data["deductible_amount"]
    standard_data["coverage_type"] = standard_data["cover_type"]
    standard_data["extra_details"] = json.dumps(standard_data)
    
    return standard_data



# ── Routes ─────────────────────────────────────────────────────

@router.get("/mine", summary="Get my policies")
def my_policies(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    policies = db.query(Policy).filter(Policy.policyholder_id == user.id).all()
    return [_policy_out(p) for p in policies]


@router.get("/{policy_id}", summary="Policy detail")
def policy_detail(policy_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p:
        raise HTTPException(404, "Policy not found")
    _ensure_owner(p, user)
    claims = db.query(Claim).filter(Claim.policy_id == p.id).all()
    out = _policy_out(p)
    out["claims_count"] = len(claims)
    out["claims"] = [
        {"id": c.id, "claim_number": c.claim_number, "status": c.status, "claim_type": c.claim_type}
        for c in claims
    ]
    return out


@router.post("/add-manual", summary="Add policy manually")
def add_manual(payload: PolicyManualPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can add policies")

    existing = db.query(Policy).filter(
        Policy.policy_number == payload.policy_number,
        Policy.policyholder_id == user.id,
    ).first()
    if existing:
        raise HTTPException(409, f"Policy {payload.policy_number} already registered")

    if payload.effective_date >= payload.expiry_date:
        raise HTTPException(400, "Expiry date must be after effective date")

    status = "active" if payload.expiry_date >= date.today() else "expired"

    p = Policy(
        policy_number     = payload.policy_number,
        policyholder_id   = user.id,
        policyholder_name = payload.policyholder_name,
        date_of_birth     = payload.date_of_birth,
        nominee_name      = payload.nominee_name,
        insurance_company = payload.insurance_company,
        plan_name         = payload.plan_name,
        policy_type       = payload.policy_type,
        coverage_type     = payload.coverage_type or (payload.plan_name or payload.policy_type.title()),
        coverage_limit    = payload.coverage_limit,
        deductible        = payload.deductible,
        premium           = payload.premium,
        effective_date    = payload.effective_date,
        expiry_date       = payload.expiry_date,
        status            = status,
        exclusions        = payload.exclusions,
        benefits          = payload.benefits,
        file_path         = payload.file_path,
        extra_details     = payload.extra_details,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"message": "Policy added successfully", "policy": _policy_out(p)}


@router.post("/upload", summary="Upload policy document — PDF/DOC OCR extraction")
async def upload_policy_doc(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    user: User       = Depends(get_current_user),
):
    if user.role != "policyholder":
        raise HTTPException(403, "Only policyholders can upload policies")

    allowed = {".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type {ext}. Use: {', '.join(allowed)}")

    fname = f"{user.id}_{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    with open(fpath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Extract text
    raw_text = _extract_text(fpath, ext)

    if not raw_text.strip():
        return {
            "message":   "Could not extract text from this file. Please fill details manually.",
            "extracted": None,
            "file_path": fpath,
            "raw_text":  "",
        }

    extracted = await _extract_policy_fields(raw_text, file.filename)
    extracted["raw_text_preview"] = raw_text[:1500]
    extracted["file_path"] = fpath   # pass back so confirm-upload can store it

    return {
        "message":   f"Extracted {sum(1 for v in extracted.values() if v and v not in ('medium','high'))} fields. Review and confirm.",
        "extracted": extracted,
        "file_path": fpath,
    }


@router.post("/confirm-upload", summary="Confirm OCR-extracted policy and save")
def confirm_upload(payload: PolicyManualPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return add_manual(payload, db, user)


# ── Edit policy ────────────────────────────────────────────────
@router.put("/{policy_id}", summary="Edit policy details")
def edit_policy(
    policy_id: int,
    payload: PolicyManualPayload,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p:
        raise HTTPException(404, "Policy not found")
    _ensure_owner(p, user)

    if payload.effective_date >= payload.expiry_date:
        raise HTTPException(400, "Expiry date must be after effective date")

    # Update fields
    p.policy_number     = payload.policy_number
    p.policy_type       = payload.policy_type
    p.plan_name         = payload.plan_name
    p.insurance_company = payload.insurance_company
    p.policyholder_name = payload.policyholder_name
    p.date_of_birth     = payload.date_of_birth
    p.nominee_name      = payload.nominee_name
    p.coverage_type     = payload.coverage_type or (payload.plan_name or payload.policy_type.title())
    p.coverage_limit    = payload.coverage_limit
    p.deductible        = payload.deductible
    p.premium           = payload.premium
    p.effective_date    = payload.effective_date
    p.expiry_date       = payload.expiry_date
    p.exclusions        = payload.exclusions
    p.benefits          = payload.benefits
    p.extra_details     = payload.extra_details
    p.status            = "active" if payload.expiry_date >= date.today() else "expired"

    db.commit()
    db.refresh(p)
    return {"message": "Policy updated", "policy": _policy_out(p)}


# ── Serve uploaded document ────────────────────────────────────
@router.get("/{policy_id}/document", summary="Download/view uploaded policy document")
def get_policy_document(
    policy_id: int,
    download: bool = False,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p:
        raise HTTPException(404, "Policy not found")
    _ensure_owner(p, user)
    if not p.file_path or not os.path.exists(p.file_path):
        raise HTTPException(404, "No document uploaded for this policy")

    ext = os.path.splitext(p.file_path)[1].lower()
    media_map = {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".txt":  "text/plain",
        ".doc":  "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_map.get(ext, "application/octet-stream")
    return FileResponse(
        path=p.file_path,
        media_type=media_type,
        filename=f"policy_{p.policy_number}{ext}",
        content_disposition_type="attachment" if download else "inline"
    )


# ── Delete policy ──────────────────────────────────────────────
@router.delete("/{policy_id}", summary="Remove a policy")
def delete_policy(policy_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p:
        raise HTTPException(404, "Policy not found")
    _ensure_owner(p, user)

    active_claims = db.query(Claim).filter(
        Claim.policy_id == p.id,
        Claim.status.notin_(["settled", "closed", "rejected"]),
    ).count()
    if active_claims:
        raise HTTPException(409, f"Cannot remove — {active_claims} active claim(s) exist")

    # Clean up all related child tables first to satisfy foreign key constraints
    claims = db.query(Claim).filter(Claim.policy_id == p.id).all()
    if claims:
        claim_ids = [c.id for c in claims]
        db.query(FNOLSubmission).filter(FNOLSubmission.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(FraudRiskScore).filter(FraudRiskScore.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(DamageAssessment).filter(DamageAssessment.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(PipelineTrace).filter(PipelineTrace.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(Settlement).filter(Settlement.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(AuditLog).filter(AuditLog.claim_id.in_(claim_ids)).delete(synchronize_session=False)
        db.query(Claim).filter(Claim.id.in_(claim_ids)).delete(synchronize_session=False)

    db.delete(p)
    db.commit()
    return {"message": "Policy removed"}
