from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.controllers.auth_controller import get_current_user
from app.database.connection import get_db
from app.models.models import EmailConfig, EmailLog, User

router = APIRouter(prefix="/mail", tags=["Mail Config & Logs"])


class EmailConfigOut(BaseModel):
    id: int
    config_name: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_from: str
    smtp_use_tls: bool
    maintenance_minutes: int
    check_interval_seconds: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmailConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    maintenance_minutes: Optional[int] = None
    check_interval_seconds: Optional[int] = None
    is_active: Optional[bool] = None


class EmailLogOut(BaseModel):
    id: int
    claim_id: int
    claim_number: str
    event_type: str
    source_status: str
    source_role: Optional[str] = None
    recipient_user_id: Optional[int] = None
    recipient_name: Optional[str] = None
    recipient_role: Optional[str] = None
    recipient_email: str
    escalation_level: int
    next_persona_role: Optional[str] = None
    subject: str
    body: str
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    status: str
    error_message: Optional[str] = None
    action_deadline_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def _require_admin_like(user: User) -> None:
    if user.role not in {"supervisor", "it_ops"}:
        raise HTTPException(
            status_code=403, detail="Only supervisor or IT ops can manage mail settings"
        )


@router.get("/config", response_model=EmailConfigOut)
def get_mail_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin_like(current_user)
    config = db.query(EmailConfig).filter(EmailConfig.config_name == "default").first()
    if not config:
        raise HTTPException(404, "Email config not found")
    return config


@router.put("/config", response_model=EmailConfigOut)
def update_mail_config(
    payload: EmailConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin_like(current_user)
    config = db.query(EmailConfig).filter(EmailConfig.config_name == "default").first()
    if not config:
        raise HTTPException(404, "Email config not found")

    data = payload.model_dump(exclude_unset=True)
    smtp_password = data.pop("smtp_password", None)
    for key, value in data.items():
        setattr(config, key, value)
    if smtp_password is not None:
        config.smtp_password = smtp_password
    db.commit()
    db.refresh(config)
    return config


@router.get("/logs", response_model=List[EmailLogOut])
def list_mail_logs(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin_like(current_user)
    return (
        db.query(EmailLog)
        .order_by(EmailLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
