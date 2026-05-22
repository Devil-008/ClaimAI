from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.database.connection import get_db
from app.models.models import Notification, User
from app.controllers.auth_controller import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    claim_id: int | None = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[NotificationOut])
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).all()

@router.post("/{notif_id}/read", response_model=NotificationOut)
def mark_as_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(404, "Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif

@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}
