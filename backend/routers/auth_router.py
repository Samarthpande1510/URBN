from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    verify_refresh_token, revoke_refresh_token,
    decode_token, get_current_user,
)

router = APIRouter()

VALID_ROLES = {"QA", "CEO", "Dev", "Purchase", "STAFF"}


class SignupReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class RefreshReq(BaseModel):
    refresh_token: str


@router.post("/signup", status_code=201)
def signup(data: SignupReq, db: Session = Depends(get_db)):
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Account already exists for this email")
    user = User(
        email=data.email,
        name=data.name,
        password=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    refresh_token = create_refresh_token({"user_id": user.id}, db=db)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    }


@router.post("/login")
def login(data: LoginReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    refresh_token = create_refresh_token({"user_id": user.id}, db=db)
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
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token({"user_id": user.id, "email": user.email, "name": user.name, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(data: RefreshReq, db: Session = Depends(get_db)):
    revoke_refresh_token(data.refresh_token, db)
    return {"message": "Logged out"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email, "role": current_user.role}
