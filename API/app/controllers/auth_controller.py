from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime

from app.database.connection import get_db
from app.models.models import User
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ── Response schemas ──────────────────────────────────────────
class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    phone: str | None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ── Login (JSON body — for React frontend) ────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    # Update last_login
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))

# ── Me ────────────────────────────────────────────────────────
from fastapi import Header, Query
from app.core.security import decode_access_token
from typing import Optional

def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> User:
    actual_token = None
    if authorization:
        actual_token = authorization.removeprefix("Bearer ").strip()
    elif token:
        actual_token = token

    if not actual_token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    payload = decode_access_token(actual_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

