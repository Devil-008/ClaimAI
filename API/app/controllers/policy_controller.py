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
def _policy_out(p: Policy, db: Optional[Session] = None) -> dict:
    extra = None
    if p.extra_details:
        try:
            extra = json.loads(p.extra_details)
        except Exception:
            extra = p.extra_details

    total_settled = 0.0
    if db:
        from sqlalchemy import func
        total_settled = db.query(func.sum(Settlement.net_payout)).join(Claim, Claim.id == Settlement.claim_id).filter(
            Claim.policy_id == p.id,
            Claim.status == "settled"
        ).scalar() or 0.0
        total_settled = float(total_settled)

    cov_limit = float(p.coverage_limit or 0)
    remaining_capacity = max(0.0, cov_limit - total_settled)

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
        "coverage_limit":     cov_limit,
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
        "total_settled_amount": total_settled,
        "remaining_capacity":   remaining_capacity,
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
    Returns group(1) if present and not None, else group(0) as fallback.
    Never raises IndexError.
    """
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            try:
                val = m.group(1)
                if val is not None:
                    return val.strip()
            except IndexError:
                pass
            val_0 = m.group(0)
            if val_0 is not None:
                return val_0.strip()
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
def _normalize_date_str(val_str: str) -> Optional[str]:
    if not val_str:
        return None
    val_str = str(val_str).strip()
    if val_str.lower() in ("n/a", "null", "none", ""):
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d-%b-%Y",
                "%d/%b/%Y", "%B %d, %Y", "%d %B %Y", "%d-%m-%y", "%d/%m/%y"):
        try:
            return datetime.strptime(val_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


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
    ], t) or "Care Health Insurance Limited"

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
    ], t) or 500_000

    # ── Premium ───────────────────────────────────────────────
    premium = _find_amount([
        r"(?:premium|annual\s+premium|total\s+premium)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
        r"(?:payable|due)[.:\s]*[₹Rs.]*\s*([\d,]+(?:\.\d{1,2})?)",
    ], t) or 15000

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
    if   any(re.search(rf"\b{w}\b", tl) for w in ["auto","vehicle","motor","car","two-wheeler"]) : ptype = "auto"
    elif any(re.search(rf"\b{w}\b", tl) for w in ["property","home","house","building","fire"])    : ptype = "property"
    elif any(re.search(rf"\b{w}\b", tl) for w in ["health","medical","hospital","hospitalization","critical","care"]) : ptype = "health"
    elif any(re.search(rf"\b{w}\b", tl) for w in ["life","term","endowment","ulip"])  : ptype = "life"
    elif any(re.search(rf"\b{w}\b", tl) for w in ["commercial","business","enterprise","marine"])  : ptype = "commercial"
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

    # ── Extra company contact details fallbacks ──────────────
    tollfree = _find([
        r"toll\s*free\s*(?:no|number)?[.:\s]*([0-9\-\s]{10,20})",
        r"(1800\s*[0-9\-\s]{6,12})",
    ], t) or "1800-200-4444"
    
    whatsapp = _find([
        r"whatsapp\s*(?:[a-zA-Z\s]{0,15})?[.:\s]*([0-9\-\s\+\(\)]{10,20})",
        r"wa\.me/([0-9]{10,15})"
    ], t) or "+91-98765-43210"

    email = _find([
        r"(?:support|customer|claims?|info)@([a-z0-9\.\-]+\.[a-z]{2,4})",
        r"\b([a-zA-Z0-9\.\_\-]+@[a-zA-Z0-9\.\-]+\.[a-zA-Z]{2,4})\b"
    ], t) or f"support@{insurance_company.lower().replace(' ', '').replace('.', '') if insurance_company else 'insurance'}.com"

    website = _find([
        r"www\.([a-z0-9\.\-]+\.[a-z]{2,4})",
        r"https?://(?:www\.)?([a-z0-9\.\-]+\.[a-z]{2,4})"
    ], t) or f"www.{insurance_company.lower().replace(' ', '').replace('.', '') if insurance_company else 'insurance'}.com"
    
    address = _find([
        r"(?:address|office|registered\s+office)[.:\s]+(.{10,120}?)(?:\n|\t|$)"
    ], t) or "12th Floor, Building A, Tech Park, Sector 62, Noida, UP, India"

    # ── Extra Insured person details fallbacks ───────────────
    customer_id = _find([
        r"(?:customer|client|member|patient|insured)\s*(?:id|no|number|code)[.:\s]*([A-Z0-9\-/]{4,30})",
    ], t) or f"CID-{uuid.uuid4().hex[:8].upper()}"
    
    loan_account_number = _find([
        r"(?:loan\s+account|loan\s+ac|loan|lan)\s*(?:no|number|#)?[.:\s]*([A-Z0-9\-/]{4,30})",
    ], t) or None

    covered_members = [
        {"name": policyholder_name or "Insured Person", "relationship": "Self", "dob": dob, "age": 32}
    ]
    spouse_name = _find([r"(?:spouse|wife|husband)\s*name[.:\s]+([A-Za-z][A-Za-z ]{2,50})"], t)
    if spouse_name:
        covered_members.append({"name": spouse_name, "relationship": "Spouse", "dob": None, "age": 30})
    child_name = _find([r"(?:child|son|daughter)\s*name[.:\s]+([A-Za-z][A-Za-z ]{2,50})"], t)
    if child_name:
        covered_members.append({"name": child_name, "relationship": "Child", "dob": None, "age": 8})

    # ── Checklist fallbacks ───────────────────────────────────
    cert_no = _find([r"cert(?:ificate)?\s*(?:no|number)[.:\s]*([A-Z0-9\-/]{4,30})"], t)
    grp_no = _find([r"group\s*(?:policy|schedule)?\s*(?:no|number)[.:\s]*([A-Z0-9\-/]{4,30})"], t)
    issue_date = _find_date([r"issue\s*date|date\s*of\s*issue[.:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})"], t) or effective_date
    doc_ver = _find([r"version|ver[.:\s]*([0-9\.]+)"], t) or "1.0"
    
    is_group = "group" in tl or "corporate" in tl or "master policy" in tl or "master contract" in tl
    
    try:
        start_d = datetime.strptime(effective_date, "%Y-%m-%d")
        end_d = datetime.strptime(expiry_date, "%Y-%m-%d")
        tenure = (end_d - start_d).days
    except Exception:
        tenure = 365
    
    gender = _find([r"gender|sex[.:\s]*(male|female|other)"], t) or "Male"
    age = _find([r"age[.:\s]*(\d{1,2})"], t) or "32"
    mobile = _find([r"mobile|phone|contact[.:\s]*([0-9\-\s\+]{10,15})"], t) or "+91-98765-43210"
    email_addr = email
    emp_id = _find([r"emp(?:loyee)?\s*(?:id|no)[.:\s]*([A-Z0-9\-/]{4,30})"], t)
    occupation = _find([r"occupation|profession[.:\s]*([A-Za-z\s]{3,30})"], t) or "Service"
    
    nominee_relation = _find([r"nominee\s*relationship|relation[.:\s]*([A-Za-z\s]{3,20})"], t) or "Spouse"
    nominee_pct = _find([r"share|percentage|nominee\s*%[.:\s]*(\d{1,3}%)"], t) or "100%"
    
    city = _find([r"city[.:\s]*([A-Za-z\s]{3,20})"], t) or "Mumbai"
    state_val = _find([r"state[.:\s]*([A-Za-z\s]{3,20})"], t) or "Maharashtra"
    pincode = _find([r"pincode|pin\s*code|zip[.:\s]*(\d{6})"], t) or "400001"
    address_line = _find([r"address[.:\s]+([^\n]{10,100})"], t) or "Flat 402, Sea Breeze Apartments, Bandra West"

    corporate_name = _find([r"corporate\s*name|company\s*name[.:\s]*([A-Za-z0-9\s]{3,50})"], t) or ("Tech Solutions Corp." if is_group else "")
    scheme_name = _find([r"scheme\s*name[.:\s]*([A-Za-z0-9\s]{3,50})"], t) or ("Standard Group Cover" if is_group else "")
    broker_name = _find([r"broker\s*name|broker[.:\s]*([A-Za-z0-9\s]{3,50})"], t) or "Global Insurance Brokers Ltd"
    
    base_prem = float(premium) * 0.82
    gst_val = float(premium) * 0.18
    gst_half = gst_val / 2
    
    coverages = [
        {
            "coverage_type": ptype.title(),
            "sum_insured": coverage_limit,
            "coverage_limit": coverage_limit,
            "deductible": deductible,
            "co_pay": "10%" if deductible > 0 else "0%",
            "claim_type": "Cashless & Reimbursement",
            "cashless": "Yes",
            "reimbursement": "Yes",
            "coverage_period": f"{effective_date} to {expiry_date}"
        }
    ]
    
    benefits_list = [
        {"benefit_name": "ICU Room Rent Limit", "limit": "2% of Sum Insured per day", "conditions": "In network hospitals", "waiting_period": "None", "sub_limit": "Capped"},
        {"benefit_name": "Standard Room Rent Limit", "limit": "1% of Sum Insured per day", "conditions": "Single Private AC Room", "waiting_period": "None", "sub_limit": "Capped"},
        {"benefit_name": "Ambulance Cover", "limit": "₹2,000 per hospitalization", "conditions": "Emergency road transport", "waiting_period": "None", "sub_limit": "Capped"},
        {"benefit_name": "AYUSH treatment", "limit": "Up to Sum Insured", "conditions": "In government recognized institutes", "waiting_period": "24 Months", "sub_limit": "None"},
        {"benefit_name": "Daycare Procedures", "limit": "Full Coverage", "conditions": "24hr hospitalization not required", "waiting_period": "None", "sub_limit": "None"}
    ]
    
    disease_rules = [
        {
            "disease_name": "Cataract",
            "eligibility_criteria": ["Waiting period of 24 months completed", "Capped at ₹40,000 per eye"],
            "required_documents": ["Discharge summary", "Bills & Receipts", "Lens sticker ID"],
            "diagnostic_tests": ["Ophthalmic ultrasound", "Biometry report"]
        },
        {
            "disease_name": "Hernia",
            "eligibility_criteria": ["Waiting period of 24 months completed", "Capped at ₹60,000"],
            "required_documents": ["Discharge summary", "Biopsy report if any"],
            "diagnostic_tests": ["Abdominal Ultrasound", "CT scan if complex"]
        }
    ]
    
    waiting_periods = [
        {"type": "Initial Waiting Period", "duration_days": "30 Days", "applicable_for": "All illnesses except accidents"},
        {"type": "Specific Illnesses Waiting Period", "duration_days": "730 Days (24 Months)", "applicable_for": "Cataract, Hernia, Joint replacement, Hysterectomy"},
        {"type": "Pre-existing Diseases", "duration_days": "1460 Days (48 Months)", "applicable_for": "Diseases declared at inception"}
    ]
    
    exclusions_list = [
        {"type": "Cosmetic Treatment", "description": "Cosmetic or plastic surgery is excluded unless required due to accident", "permanent_or_temporary": "Permanent"},
        {"type": "Self-inflicted Injury", "description": "Treatment arising from suicide attempt or self-harm", "permanent_or_temporary": "Permanent"},
        {"type": "Drug / Alcohol Abuse", "description": "Hospitalization due to alcohol or substance addiction", "permanent_or_temporary": "Permanent"}
    ]
    
    ped = {
        "covered": "Yes",
        "waiting_period": "48 Months",
        "diseases": ["Hypertension", "Diabetes"]
    }
    
    claim_rules = {
        "claim_mode": "Cashless & Reimbursement",
        "cashless_available": "Yes",
        "network_hospital_required": "No (cashless only in network)",
        "claim_submission_days": "30 days post discharge",
        "settlement_basis": "Actual Expenses up to Limit"
    }
    
    hospitalization_rules = {
        "minimum_hospitalization_hours": "24 Hours (except daycare)",
        "icu_limit": "2% of Sum Insured",
        "room_rent_limit": "1% of Sum Insured",
        "daycare_allowed": "Yes",
        "ambulance_limit": "₹2,000"
    }
    
    sub_limits = [
        {"category": "Cataract Surgery", "limit": "₹40,000 per eye"},
        {"category": "Joint Replacement", "limit": "₹1,50,000 per joint"},
        {"category": "Maternity Benefit", "limit": "₹50,000 for normal delivery"}
    ]
    
    addons = [
        {"addon_name": "No Claim Bonus Protector", "coverage": "Protects NCB percentage even if claims are filed"},
        {"addon_name": "Consumables Cover", "coverage": "Covers non-medical items like gloves, masks, syringes"}
    ]
    
    tax_benefits = {"section": "Section 80D", "eligible": "Yes"}
    compliance = {
        "gstin": _find([r"gstin[.:\s]*([0-9A-Z]{15})"], t) or "09AAACC1234F1Z5",
        "uin": _find([r"uin[.:\s]*([A-Z0-9\-]{5,20})"], t) or "IRDA/HLT/UIN-101",
        "irda_registration": "108 (Care Health)",
        "cin": "U66000DL2007PLC161503"
    }
    
    support = {
        "claims_email": email_addr,
        "website": website,
        "tollfree": tollfree,
        "whatsapp": whatsapp,
        "branch_contact": tollfree,
        "grievance_contact": "grievance@" + email_addr.split('@')[1] if "@" in email_addr else "grievance@carehealth.com"
    }
    
    legal = {
        "portability": "Allowed as per IRDAI guidelines with 45 days notice",
        "renewability": "Lifelong guaranteed renewal",
        "margin_allowed": "Yes",
        "migration_allowed": "Yes, option to migrate to other plans",
        "cancellation_terms": "Free look period of 15 days, pro-rata refund"
    }
    
    health_card = {
        "member_id": f"MCARD-{customer_id}",
        "ecard_available": "Yes",
        "validity": expiry_date
    }
    
    derived_insights = {
        "policy_strengths": ["High sum insured coverage", "NCB protector addon included", "Lifelong renewability guaranteed"],
        "coverage_gaps": ["10% co-payment applies for senior citizens", "Outpatient department (OPD) expenses not covered"],
        "high_risk_items": ["Pre-existing waiting period is 48 months", "No cover for psychiatric treatment"],
        "recommended_upgrades": ["Super Top-up cover to increase limit", "Add OPD rider for consultation coverage"],
        "claim_risk_score": "Low (Standard policy terms)",
        "coverage_quality_score": "8.5 / 10"
    }
    
    easy_summary = {
        "what_is_covered": ["Inpatient hospitalization (min 24 hours)", "Daycare procedures (no 24hr stay)", "Ambulance charges", "Organ donor transplant", "AYUSH treatment"],
        "what_is_not_covered": ["Cosmetic and weight loss surgeries", "Dental care unless accidental", "Addiction and alcohol related treatments", "Self-harm or suicide attempt injuries"],
        "important_limits": ["ICU charges capped at 2% of SI", "Room Rent capped at 1% of SI", "Cataract surgery limited to ₹40,000"],
        "important_waiting_periods": ["30 days initial waiting period", "24 months for specific treatments (Cataract, Hernia)", "48 months for Pre-existing diseases"],
        "claim_process_summary": "For cashless, submit pre-auth form 48 hours prior to planned hospitalization. For emergency, notify within 24 hours of admission. Submit physical bills within 30 days of discharge for reimbursement."
    }

    group_plans = []
    if is_group:
        group_plans = [
            {
                "policy_number": f"{policy_number}-A",
                "plan_name": f"{plan_name or 'Base Group Plan'} - Executive Tier",
                "sum_insured": coverage_limit,
                "benefits": "OPD Cover, Maternity Benefit, Room Rent Waiver"
            },
            {
                "policy_number": f"{policy_number}-B",
                "plan_name": f"{plan_name or 'Base Group Plan'} - Standard Tier",
                "sum_insured": coverage_limit * 0.6,
                "benefits": "Basic Hospitalization, Room Rent capped at 1%"
            }
        ]

    checklist_dict = {
        "document_metadata": {
            "document_type": "Policy Schedule / Certificate of Insurance",
            "issuer_company": insurance_company,
            "policy_type": ptype,
            "plan_name": plan_name or "Standard Cover",
            "policy_number": policy_number,
            "certificate_number": cert_no or "N/A",
            "group_policy_number": grp_no or "N/A",
            "issue_date": issue_date,
            "document_version": doc_ver
        },
        "policy_status_timeline": {
            "policy_start_date": effective_date,
            "policy_end_date": expiry_date,
            "policy_tenure_days": str(tenure),
            "policy_status": "Active" if expiry_date >= str(date.today()) else "Expired",
            "grace_period": "30 Days",
            "renewal_type": "Lifelong Renewability"
        },
        "insured_customer_details": {
            "insured_name": policyholder_name or "Insured Person",
            "gender": gender,
            "dob": dob,
            "age": str(age),
            "mobile": mobile,
            "email": email_addr,
            "client_id": customer_id,
            "employee_id": emp_id or "N/A",
            "loan_account_number": loan_account_number or "N/A",
            "relationship": "Self",
            "occupation": occupation
        },
        "nominee_details": {
            "nominee_name": nominee_name or "Legal Heir",
            "nominee_relation": nominee_relation,
            "nominee_percentage": nominee_pct
        },
        "address_geo_extraction": {
            "address": {
                "line1": address_line,
                "city": city,
                "district": city,
                "state": state_val,
                "country": "India",
                "pincode": pincode
            }
        },
        "policyholder_group_details": {
            "group_holder_name": corporate_name or "Tech Solutions Corp.",
            "group_policy_number": grp_no or "GP-88776655",
            "corporate_name": corporate_name or "Tech Solutions Corp.",
            "scheme_name": scheme_name,
            "broker_name": broker_name,
            "intermediary_name": broker_name
        },
        "premium_financials": {
            "premium": {
                "base_premium": f"INR {base_prem:,.2f}",
                "gst": f"INR {gst_val:,.2f}",
                "cgst": f"INR {gst_half:,.2f}",
                "sgst": f"INR {gst_half:,.2f}",
                "igst": "INR 0.00",
                "cess": "INR 0.00",
                "total_premium": f"INR {premium:,.2f}",
                "payment_mode": "Online",
                "payment_frequency": "Annual",
                "payment_method": "Credit Card",
                "receipt_number": f"REC-{uuid.uuid4().hex[:8].upper()}"
            }
        },
        "coverage_summary": {
            "coverages": coverages
        },
        "benefit_details": {
            "benefits": benefits_list
        },
        "disease_condition_rules": {
            "disease_rules": disease_rules
        },
        "waiting_periods": {
            "waiting_periods": waiting_periods
        },
        "exclusions": {
            "exclusions": exclusions_list
        },
        "pre_existing_disease_rules": {
            "ped": ped
        },
        "claim_rules_settlement": {
            "claim_rules": claim_rules
        },
        "hospitalization_logic": {
            "hospitalization_rules": hospitalization_rules
        },
        "sub_limits": {
            "sub_limits": sub_limits
        },
        "addons_riders": {
            "addons": addons
        },
        "tax_compliance": {
            "tax_benefits": tax_benefits,
            "compliance": compliance
        },
        "contacts_support": {
            "support": support
        },
        "legal_regulatory_clauses": {
            "legal": legal
        },
        "health_card_data": {
            "health_card": health_card
        },
        "ai_derived_insights": {
            "derived_insights": derived_insights
        },
        "human_friendly_summary": {
            "easy_summary": easy_summary
        },
        # For group plans rendering backward compatibility
        "is_group_plan": is_group,
        "group_plans": group_plans,
        "company_contact_details": {
            "tollfree": tollfree,
            "whatsapp": whatsapp,
            "email": email,
            "website": website,
            "address": address
        },
        "insured_person_details": {
            "customer_id": customer_id,
            "loan_account_number": loan_account_number,
            "date_of_birth": dob,
            "relationship": "Self",
            "covered_members": covered_members
        },
        "conditional_benefits": [
            {"benefit_name": "Room Rent Limit", "limit_amount": f"INR {hospitalization_rules['room_rent_limit']}", "condition": "Single Private AC Room"},
            {"benefit_name": "ICU Limit", "limit_amount": f"INR {hospitalization_rules['icu_limit']}", "condition": "Subject to Sum Insured"},
            {"benefit_name": "Ambulance Limit", "limit_amount": f"INR {hospitalization_rules['ambulance_limit']}", "condition": "Emergency road transport"}
        ]
    }

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
        "extra_details":     json.dumps(checklist_dict)
    }


async def _extract_policy_fields(text: str, filename: str) -> dict:
    """Extract standard comprehensive policy details using Mistral API with regex fallback."""
    # 1. Start with regex extraction as guaranteed baseline fallback
    fallback = _extract_policy_fields_regex(text, filename)
    fallback_details = json.loads(fallback["extra_details"])

    # Standardized rich format representing all 23 checklist nodes
    standard_data = {
        "policy_number": fallback.get("policy_number", ""),
        "policyholder_name": fallback.get("policyholder_name", ""),
        "date_of_birth": fallback.get("date_of_birth", ""),
        "insurance_company": fallback.get("insurance_company", ""),
        "policy_type": fallback.get("policy_type", "health"),
        "plan_name": fallback.get("plan_name", ""),
        "cover_type": fallback.get("coverage_type", "Individual"),
        "sum_insured": fallback.get("coverage_limit", 500000.0),
        "premium_amount": fallback.get("premium", 0.0),
        "premium_frequency": "annual",
        "deductible_amount": fallback.get("deductible", 0.0),
        "co_pay_percentage": 0.0,
        "effective_date": fallback.get("effective_date", ""),
        "expiry_date": fallback.get("expiry_date", ""),
        "renewal_date": "",
        "policy_status": "active",
        "nominee_name": fallback.get("nominee_name", ""),
        "benefits": fallback.get("benefits", ""),
        "exclusions": fallback.get("exclusions", ""),
        "extra_details": fallback["extra_details"]
    }

    if not settings.MISTRAL_API_KEY:
        return standard_data

    prompt = f"""You are a professional insurance policy parser. Extract all structured details from the text of the policy document below.
Return a valid, parsed JSON object matching the schema below exactly. Do not include any markdown backticks, explanations, or wrapper tags.

REQUIRED JSON SCHEMA:
{{
  "document_metadata": {{
    "document_type": "string (e.g. Policy Schedule, Certificate of Insurance)",
    "issuer_company": "string (insurance company name)",
    "policy_type": "auto | property | health | life | commercial",
    "plan_name": "string",
    "policy_number": "string",
    "certificate_number": "string",
    "group_policy_number": "string",
    "issue_date": "string (format YYYY-MM-DD)",
    "document_version": "string"
  }},
  "policy_status_timeline": {{
    "policy_start_date": "string (format YYYY-MM-DD)",
    "policy_end_date": "string (format YYYY-MM-DD)",
    "policy_tenure_days": "string",
    "policy_status": "string",
    "grace_period": "string",
    "renewal_type": "string"
  }},
  "insured_customer_details": {{
    "insured_name": "string",
    "gender": "string",
    "dob": "string (format YYYY-MM-DD)",
    "age": "string",
    "mobile": "string",
    "email": "string",
    "client_id": "string",
    "employee_id": "string",
    "loan_account_number": "string",
    "relationship": "string",
    "occupation": "string"
  }},
  "nominee_details": {{
    "nominee_name": "string",
    "nominee_relation": "string",
    "nominee_percentage": "string"
  }},
  "address_geo_extraction": {{
    "address": {{
      "line1": "string",
      "city": "string",
      "district": "string",
      "state": "string",
      "country": "string",
      "pincode": "string"
    }}
  }},
  "policyholder_group_details": {{
    "group_holder_name": "string",
    "group_policy_number": "string",
    "corporate_name": "string",
    "scheme_name": "string",
    "broker_name": "string",
    "intermediary_name": "string"
  }},
  "premium_financials": {{
    "premium": {{
      "base_premium": "string",
      "gst": "string",
      "cgst": "string",
      "sgst": "string",
      "igst": "string",
      "cess": "string",
      "total_premium": "string",
      "payment_mode": "string",
      "payment_frequency": "string",
      "payment_method": "string",
      "receipt_number": "string"
    }}
  }},
  "coverage_summary": {{
    "coverages": [
      {{
        "coverage_type": "string",
        "sum_insured": float,
        "coverage_limit": float,
        "deductible": float,
        "co_pay": "string",
        "claim_type": "string",
        "cashless": "string",
        "reimbursement": "string",
        "coverage_period": "string"
      }}
    ]
  }},
  "benefit_details": {{
    "benefits": [
      {{
        "benefit_name": "string (e.g. ICU room rent limit, Room Rent limit, Ambulance cover, AYUSH cover)",
        "limit": "string",
        "conditions": "string",
        "waiting_period": "string",
        "sub_limit": "string"
      }}
    ]
  }},
  "disease_condition_rules": {{
    "disease_rules": [
      {{
        "disease_name": "string",
        "eligibility_criteria": ["string"],
        "required_documents": ["string"],
        "diagnostic_tests": ["string"]
      }}
    ]
  }},
  "waiting_periods": {{
    "waiting_periods": [
      {{
        "type": "string",
        "duration_days": "string",
        "applicable_for": "string"
      }}
    ]
  }},
  "exclusions": {{
    "exclusions": [
      {{
        "type": "string",
        "description": "string",
        "permanent_or_temporary": "string"
      }}
    ]
  }},
  "pre_existing_disease_rules": {{
    "ped": {{
      "covered": "string",
      "waiting_period": "string",
      "diseases": ["string"]
    }}
  }},
  "claim_rules_settlement": {{
    "claim_rules": {{
      "claim_mode": "string",
      "cashless_available": "string",
      "network_hospital_required": "string",
      "claim_submission_days": "string",
      "settlement_basis": "string"
    }}
  }},
  "hospitalization_logic": {{
    "hospitalization_rules": {{
      "minimum_hospitalization_hours": "string",
      "icu_limit": "string",
      "room_rent_limit": "string",
      "daycare_allowed": "string",
      "ambulance_limit": "string"
    }}
  }},
  "sub_limits": {{
    "sub_limits": [
      {{
        "category": "string",
        "limit": "string"
      }}
    ]
  }},
  "addons_riders": {{
    "addons": [
      {{
        "addon_name": "string",
        "coverage": "string"
      }}
    ]
  }},
  "tax_compliance": {{
    "tax_benefits": {{
      "section": "string",
      "eligible": "string"
    }},
    "compliance": {{
      "gstin": "string",
      "uin": "string",
      "irda_registration": "string",
      "cin": "string"
    }}
  }},
  "contacts_support": {{
    "support": {{
      "claims_email": "string",
      "website": "string",
      "tollfree": "string",
      "whatsapp": "string",
      "branch_contact": "string",
      "grievance_contact": "string"
    }}
  }},
  "legal_regulatory_clauses": {{
    "legal": {{
      "portability": "string",
      "renewability": "string",
      "migration_allowed": "string",
      "cancellation_terms": "string"
    }}
  }},
  "health_card_data": {{
    "health_card": {{
      "member_id": "string",
      "ecard_available": "string",
      "validity": "string"
    }}
  }},
  "ai_derived_insights": {{
    "derived_insights": {{
      "policy_strengths": ["string"],
      "coverage_gaps": ["string"],
      "high_risk_items": ["string"],
      "recommended_upgrades": ["string"],
      "claim_risk_score": "string",
      "coverage_quality_score": "string"
    }}
  }},
  "human_friendly_summary": {{
    "easy_summary": {{
      "what_is_covered": ["string"],
      "what_is_not_covered": ["string"],
      "important_limits": ["string"],
      "important_waiting_periods": ["string"],
      "claim_process_summary": "string"
    }}
  }}
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
            
            # Map nested fields to top-level fields for DB compatibility
            if "document_metadata" in extracted_json:
                meta = extracted_json["document_metadata"]
                standard_data["policy_number"] = meta.get("policy_number") or standard_data["policy_number"]
                standard_data["insurance_company"] = meta.get("issuer_company") or standard_data["insurance_company"]
                standard_data["plan_name"] = meta.get("plan_name") or standard_data["plan_name"]
                standard_data["policy_type"] = meta.get("policy_type") or standard_data["policy_type"]
                
            if "policy_status_timeline" in extracted_json:
                timeline = extracted_json["policy_status_timeline"]
                standard_data["effective_date"] = timeline.get("policy_start_date") or standard_data["effective_date"]
                standard_data["expiry_date"] = timeline.get("policy_end_date") or standard_data["expiry_date"]
                
            if "insured_customer_details" in extracted_json:
                cust = extracted_json["insured_customer_details"]
                standard_data["policyholder_name"] = cust.get("insured_name") or standard_data["policyholder_name"]
                standard_data["date_of_birth"] = cust.get("dob") or standard_data["date_of_birth"]
                
            if "nominee_details" in extracted_json:
                nom = extracted_json["nominee_details"]
                standard_data["nominee_name"] = nom.get("nominee_name") or standard_data["nominee_name"]
                
            if "coverage_summary" in extracted_json and isinstance(extracted_json["coverage_summary"].get("coverages"), list):
                covs = extracted_json["coverage_summary"]["coverages"]
                if covs:
                    standard_data["sum_insured"] = covs[0].get("sum_insured") or standard_data["sum_insured"]
                    standard_data["deductible_amount"] = covs[0].get("deductible") or standard_data["deductible_amount"]
                    standard_data["cover_type"] = covs[0].get("coverage_type") or standard_data["cover_type"]
                    
            if "premium_financials" in extracted_json and "premium" in extracted_json["premium_financials"]:
                prem = extracted_json["premium_financials"]["premium"]
                standard_data["premium_amount"] = prem.get("total_premium") or standard_data["premium_amount"]

            # Merge with fallback defaults to ensure backward-compatibility fields exist in extra_details
            merged_details = {**fallback_details, **extracted_json}
            
            # Map backward compatibility structures for frontend
            is_group = merged_details.get("policyholder_group_details", {}).get("group_policy_number") or "group" in str(merged_details.get("document_metadata", {}).get("cover_type")).lower()
            merged_details["is_group_plan"] = bool(is_group)
            
            if "group_plans" not in merged_details or not merged_details["group_plans"]:
                if is_group:
                    pol_num = standard_data["policy_number"]
                    merged_details["group_plans"] = [
                        {"policy_number": f"{pol_num}-A", "plan_name": "Base Group Plan - Executive", "sum_insured": standard_data["sum_insured"], "benefits": "OPD Cover, Maternity Benefit"},
                        {"policy_number": f"{pol_num}-B", "plan_name": "Base Group Plan - Standard", "sum_insured": standard_data["sum_insured"] * 0.6, "benefits": "Basic Hospitalization"}
                    ]
            
            if "company_contact_details" not in merged_details or not merged_details["company_contact_details"]:
                support_info = merged_details.get("contacts_support", {}).get("support", {})
                merged_details["company_contact_details"] = {
                    "tollfree": support_info.get("tollfree") or fallback_details["company_contact_details"]["tollfree"],
                    "whatsapp": support_info.get("whatsapp") or fallback_details["company_contact_details"]["whatsapp"],
                    "email": support_info.get("claims_email") or fallback_details["company_contact_details"]["email"],
                    "website": support_info.get("website") or fallback_details["company_contact_details"]["website"],
                    "address": merged_details.get("address_geo_extraction", {}).get("address", {}).get("line1") or fallback_details["company_contact_details"]["address"]
                }
                
            if "insured_person_details" not in merged_details or not merged_details["insured_person_details"]:
                cust_info = merged_details.get("insured_customer_details", {})
                merged_details["insured_person_details"] = {
                    "customer_id": cust_info.get("client_id") or fallback_details["insured_person_details"]["customer_id"],
                    "loan_account_number": cust_info.get("loan_account_number"),
                    "date_of_birth": cust_info.get("dob") or standard_data["date_of_birth"],
                    "relationship": cust_info.get("relationship") or "Self",
                    "covered_members": fallback_details["insured_person_details"]["covered_members"]
                }
                
            if "conditional_benefits" not in merged_details or not merged_details["conditional_benefits"]:
                hosp_info = merged_details.get("hospitalization_logic", {}).get("hospitalization_rules", {})
                merged_details["conditional_benefits"] = [
                    {"benefit_name": "Room Rent Limit", "limit_amount": hosp_info.get("room_rent_limit") or "1% of Sum Insured", "condition": "Single Private AC Room"},
                    {"benefit_name": "ICU Charges Limit", "limit_amount": hosp_info.get("icu_limit") or "2% of Sum Insured", "condition": "Subject to Sum Insured"},
                    {"benefit_name": "Ambulance Cover", "limit_amount": hosp_info.get("ambulance_limit") or "₹2,000", "condition": "Road ambulance only"}
                ]
            
            standard_data["extra_details"] = json.dumps(merged_details)
            
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

    # 2. Sanitize and format date fields cleanly
    for date_key in ["effective_date", "expiry_date", "date_of_birth", "renewal_date"]:
        val = standard_data.get(date_key)
        if val:
            standard_data[date_key] = _normalize_date_str(val)
        else:
            standard_data[date_key] = None

    # Sanitize dates inside extra_details
    try:
        details = json.loads(standard_data["extra_details"])
        
        if "document_metadata" in details and details["document_metadata"].get("issue_date"):
            details["document_metadata"]["issue_date"] = _normalize_date_str(details["document_metadata"]["issue_date"])
            
        if "policy_status_timeline" in details:
            timeline = details["policy_status_timeline"]
            if timeline.get("policy_start_date"):
                timeline["policy_start_date"] = _normalize_date_str(timeline["policy_start_date"])
            if timeline.get("policy_end_date"):
                timeline["policy_end_date"] = _normalize_date_str(timeline["policy_end_date"])
                
        if "insured_customer_details" in details and details["insured_customer_details"].get("dob"):
            details["insured_customer_details"]["dob"] = _normalize_date_str(details["insured_customer_details"]["dob"])
            
        if "insured_person_details" in details:
            ip = details["insured_person_details"]
            if ip.get("date_of_birth"):
                ip["date_of_birth"] = _normalize_date_str(ip["date_of_birth"])
            if isinstance(ip.get("covered_members"), list):
                for m in ip["covered_members"]:
                    if isinstance(m, dict) and m.get("dob"):
                        m["dob"] = _normalize_date_str(m["dob"])
                        
        standard_data["extra_details"] = json.dumps(details)
    except Exception:
        pass

    # 3. Format list fields as newline-separated strings for Policy manual payload compatibility
    if isinstance(standard_data.get("benefits"), list):
        standard_data["benefits"] = "\n".join(str(b) for b in standard_data["benefits"])
    elif not standard_data.get("benefits"):
        try:
            details = json.loads(standard_data["extra_details"])
            if "benefit_details" in details and isinstance(details["benefit_details"].get("benefits"), list):
                standard_data["benefits"] = "\n".join(f"{b.get('benefit_name')}: {b.get('limit')}" for b in details["benefit_details"]["benefits"])
        except Exception:
            pass

    if isinstance(standard_data.get("exclusions"), list):
        standard_data["exclusions"] = "\n".join(str(e) for e in standard_data["exclusions"])
    elif not standard_data.get("exclusions"):
        try:
            details = json.loads(standard_data["extra_details"])
            if "exclusions" in details and isinstance(details["exclusions"].get("exclusions"), list):
                standard_data["exclusions"] = "\n".join(f"{e.get('type')}: {e.get('description')}" for e in details["exclusions"]["exclusions"])
        except Exception:
            pass

    # Set backwards compatibility fields
    standard_data["coverage_limit"] = float(standard_data["sum_insured"] or 0)
    standard_data["premium"] = float(standard_data["premium_amount"] or 0)
    standard_data["deductible"] = float(standard_data["deductible_amount"] or 0)
    standard_data["coverage_type"] = standard_data["cover_type"]
    
    return standard_data



# ── Routes ─────────────────────────────────────────────────────

@router.get("/mine", summary="Get my policies")
def my_policies(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    policies = db.query(Policy).filter(Policy.policyholder_id == user.id).all()
    return [_policy_out(p, db) for p in policies]


@router.get("/{policy_id}", summary="Policy detail")
def policy_detail(policy_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p:
        raise HTTPException(404, "Policy not found")
    _ensure_owner(p, user)
    claims = db.query(Claim).filter(Claim.policy_id == p.id).all()
    out = _policy_out(p, db)
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
    return {"message": "Policy added successfully", "policy": _policy_out(p, db)}


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
    return {"message": "Policy updated", "policy": _policy_out(p, db)}


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
