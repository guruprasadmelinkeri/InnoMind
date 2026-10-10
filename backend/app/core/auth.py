"""Small dependency-free password and signed bearer-token helpers."""
import base64
import hashlib
import hmac
import json
import secrets
import time
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.database import get_db
from app.models.account import Account

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def _secret() -> bytes:
    if not settings.AUTH_SECRET_KEY:
        raise HTTPException(status_code=503, detail="AUTH_SECRET_KEY must be configured before enabling sign-in")
    return settings.AUTH_SECRET_KEY.encode()

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return base64.urlsafe_b64encode(salt).decode() + "." + base64.urlsafe_b64encode(digest).decode()

def verify_password(password: str, stored: str) -> bool:
    try:
        salt_text, digest_text = stored.split(".", 1)
        salt = base64.urlsafe_b64decode(salt_text)
        expected = base64.urlsafe_b64decode(digest_text)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def issue_token(account: Account) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"sub": account.id, "exp": int(time.time()) + settings.AUTH_TOKEN_TTL_MINUTES * 60}, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
    return payload + "." + base64.urlsafe_b64encode(sig).decode().rstrip("=")

def get_current_account(token: str | None = Depends(oauth2), db: Session = Depends(get_db)) -> Account:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required", headers={"WWW-Authenticate": "Bearer"})
    if not token:
        raise unauthorized
    try:
        payload, signature = token.split(".", 1)
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, supplied):
            raise unauthorized
        body = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if int(body["exp"]) < int(time.time()):
            raise unauthorized
        account = db.get(Account, int(body["sub"]))
        if not account or not account.active:
            raise unauthorized
        return account
    except HTTPException:
        raise
    except Exception:
        raise unauthorized

def require_roles(*roles: str):
    def dependency(account: Account = Depends(get_current_account)) -> Account:
        # Roles are case-insensitive at the API boundary. This keeps older
        # account rows such as "admin" compatible with the current role policy.
        if (account.role or "").upper() not in {role.upper() for role in roles}:
            raise HTTPException(status_code=403, detail="Your account cannot access this operation")
        return account
    return dependency

def assert_hospital_scope(account: Account, hospital_id: int) -> None:
    if (account.role or "").upper() == "HOSPITAL" and account.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="This hospital account cannot access another hospital")
