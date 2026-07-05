from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    verify_refresh_token, revoke_refresh_token,
    check_login_rate_limit, record_login_attempt,
    get_current_user,
)

router = APIRouter()

VALID_ROLES = {"QA", "CEO", "Dev", "Sales", "STAFF"}


def role_from_email(email: str) -> str:
    parts = email.lower().split("@")
    local = parts[0] if parts else ""
    domain = parts[1] if len(parts) > 1 else ""
    if "qa" in local or domain.startswith("qa"):
        return "QA"
    if "ceo" in local or domain.startswith("ceo"):
        return "CEO"
    if "dev" in local or domain.startswith("dev"):
        return "Dev"
    if "sales" in local or "purchase" in local or domain.startswith("sales") or domain.startswith("purchase"):
        return "Sales"
    return "STAFF"


class SignupReq(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class RefreshReq(BaseModel):
    refresh_token: str


def _device_label(request: Request) -> str | None:
    ua = request.headers.get("user-agent", "")
    if not ua:
        return None
    # Condense to "Browser · OS" for display
    browser = "Chrome" if "Chrome" in ua else "Safari" if "Safari" in ua else "Firefox" if "Firefox" in ua else "Browser"
    os_hint = "Mac" if "Mac" in ua else "Windows" if "Windows" in ua else "iOS" if "iPhone" in ua or "iPad" in ua else "Android" if "Android" in ua else "Device"
    return f"{browser} · {os_hint}"


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)


@router.post("/signup", status_code=201)
def signup(data: SignupReq, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    role = role_from_email(data.email)
    user = User(
        email=data.email,
        name=data.name,
        password=hash_password(data.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    refresh_token = create_refresh_token({"user_id": user.id}, db=db, device_label=_device_label(request))
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }


@router.post("/login")
def login(data: LoginReq, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    check_login_rate_limit(data.email, ip, db)

    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password):
        record_login_attempt(data.email, ip, succeeded=False, db=db)
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    record_login_attempt(data.email, ip, succeeded=True, db=db)
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    refresh_token = create_refresh_token({"user_id": user.id}, db=db, device_label=_device_label(request))
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }


@router.post("/refresh")
def refresh(data: RefreshReq, db: Session = Depends(get_db)):
    user_id = verify_refresh_token(data.refresh_token, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(data: RefreshReq, db: Session = Depends(get_db)):
    revoke_refresh_token(data.refresh_token, db)
    return {"message": "Logged out"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email, "role": current_user.role}
