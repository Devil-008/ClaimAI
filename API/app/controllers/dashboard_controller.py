from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database.connection import get_db
from app.models.models import KPISnapshot, SystemHealth, Claim
from app.controllers.auth_controller import get_current_user, User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/kpi")
def get_kpis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("supervisor", "it_ops"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Access denied")
    snapshots = db.query(KPISnapshot).order_by(KPISnapshot.snapshot_date.desc()).limit(7).all()
    return [
        {
            "date": str(s.snapshot_date),
            "total_claims": s.total_claims,
            "auto_settled": s.auto_settled,
            "stp_rate": float(s.stp_rate or 0),
            "avg_tat_minutes": float(s.avg_tat_minutes or 0),
            "csat_score": float(s.csat_score or 0),
            "p95_latency_ms": s.p95_latency_ms,
        }
        for s in snapshots
    ]

@router.get("/system-health")
def get_system_health(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Latest reading per service
    subq = (
        db.query(SystemHealth.service_name, func.max(SystemHealth.id).label("max_id"))
        .group_by(SystemHealth.service_name)
        .subquery()
    )
    results = (
        db.query(SystemHealth)
        .join(subq, SystemHealth.id == subq.c.max_id)
        .all()
    )
    return [
        {
            "service_name": r.service_name,
            "status": r.status,
            "response_time_ms": r.response_time_ms,
            "error_rate": float(r.error_rate or 0),
            "cpu_usage": float(r.cpu_usage or 0),
            "memory_usage": float(r.memory_usage or 0),
        }
        for r in results
    ]

@router.get("/claim-stats")
def get_claim_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(func.count(Claim.id)).scalar()
    settled = db.query(func.count(Claim.id)).filter(Claim.status == "settled").scalar()
    escalated_adj = db.query(func.count(Claim.id)).filter(Claim.status == "escalated_adjuster").scalar()
    escalated_siu = db.query(func.count(Claim.id)).filter(Claim.status == "escalated_siu").scalar()
    return {
        "total": total,
        "settled": settled,
        "escalated_adjuster": escalated_adj,
        "escalated_siu": escalated_siu,
        "in_progress": total - settled - escalated_adj - escalated_siu,
    }
