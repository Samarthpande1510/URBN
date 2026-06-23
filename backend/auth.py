import os
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import RefreshToken, User

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = 60       # longer TTL — no cookie refresh on mobile
REFRESH_TOKEN_TTL_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)
    payload["type"] = "access"
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, db: Session) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_TTL_DAYS)
    payload["type"] = "refresh"
    encoded = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    db.add(RefreshToken(
        user_id=data["user_id"],
        token=pwd_context.hash(encoded),
    ))
    db.commit()
    return encoded


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def verify_refresh_token(token: str, db: Session) -> int | None:
    decoded = decode_token(token)
    if not decoded or decoded.get("type") != "refresh":
        return None
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == decoded["user_id"],
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not db_token or not pwd_context.verify(token, db_token.token):
        return None
    return db_token.user_id


def revoke_refresh_token(token: str, db: Session):
    decoded = decode_token(token)
    if not decoded:
        return
    expires_at = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc).replace(tzinfo=None)
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == decoded["user_id"],
            RefreshToken.expires_at == expires_at,
        )
        .first()
    )
    if db_token:
        db_token.revoked = True
        db.commit()


# ── Dependency injected into protected routes ──────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_role(*roles: str):
    """Factory that returns a dependency checking the user has one of the given roles."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return _check
