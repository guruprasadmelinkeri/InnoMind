from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.auth import get_current_account, hash_password, issue_token, verify_password, require_roles
from app.db.database import get_db
from app.models.account import Account
from app.models.hospital import Hospital

router = APIRouter(prefix="/auth", tags=["Authentication"])

class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=10, max_length=256)

class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=160)

class HospitalAccountCreate(Credentials):
    display_name: str = Field(min_length=1, max_length=160)
    hospital_id: int

@router.post("/register")
def register(data: Registration, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.query(Account).filter(func.lower(Account.email) == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    account = Account(email=email, password_hash=hash_password(data.password), role="USER", display_name=data.display_name.strip())
    db.add(account)
    db.flush()
    token = issue_token(account)
    db.commit()
    db.refresh(account)
    return {"access_token": token, "token_type": "bearer", "account": public_account(account)}

@router.post("/login")
def login(data: Credentials, db: Session = Depends(get_db)):
    account = db.query(Account).filter(func.lower(Account.email) == data.email.lower()).first()
    if not account or not account.active or not verify_password(data.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return {"access_token": issue_token(account), "token_type": "bearer", "account": public_account(account)}

@router.get("/me")
def me(account: Account = Depends(get_current_account)):
    return public_account(account)

@router.post("/hospital-account")
def create_hospital_account(data: HospitalAccountCreate, db: Session = Depends(get_db), actor: Account = Depends(require_roles("ADMIN"))):
    hospital = db.get(Hospital, data.hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    email = data.email.lower()
    if db.query(Account).filter(func.lower(Account.email) == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    account = Account(email=email, password_hash=hash_password(data.password), role="HOSPITAL", hospital_id=hospital.id, display_name=data.display_name.strip())
    db.add(account)
    db.commit()
    return public_account(account)

def public_account(account: Account):
    return {"id": account.id, "email": account.email, "role": (account.role or "").upper(), "display_name": account.display_name, "hospital_id": account.hospital_id}
