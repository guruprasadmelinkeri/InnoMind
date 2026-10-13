import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from app.core.auth import require_roles
from app.db.database import get_db
from app.models.account import Account
from app.models.emergency_contact import EmergencyContact

router = APIRouter(prefix="/emergency-contacts", tags=["Emergency contacts"])

class ContactInput(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    contact_type: Literal["EMAIL", "PHONE"]
    value: str = Field(min_length=3, max_length=320)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Contact name cannot be empty")
        return value

    @field_validator("value")
    @classmethod
    def validate_value(cls, value: str, info):
        value = value.strip()
        if info.data.get("contact_type") == "EMAIL":
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
                raise ValueError("Enter a valid email address")
            return value.lower()
        if not re.fullmatch(r"\+[0-9][0-9 ()-]{6,19}", value):
            raise ValueError("Enter a valid phone number with country code, such as +91 98765 43210")
        return value

def _contact_json(contact: EmergencyContact):
    return {"id": contact.id, "label": contact.label, "contact_type": contact.contact_type, "value": contact.value}

@router.get("")
def list_contacts(db: Session = Depends(get_db), account: Account = Depends(require_roles("USER"))):
    return [_contact_json(contact) for contact in db.query(EmergencyContact).filter_by(account_id=account.id).order_by(EmergencyContact.id).all()]

@router.post("", status_code=status.HTTP_201_CREATED)
def add_contact(data: ContactInput, db: Session = Depends(get_db), account: Account = Depends(require_roles("USER"))):
    current = db.query(EmergencyContact).filter_by(account_id=account.id).all()
    if len(current) >= 5:
        raise HTTPException(status_code=400, detail="You can save up to 5 emergency contacts")
    if any(c.contact_type == data.contact_type and c.value.lower() == data.value.lower() for c in current):
        raise HTTPException(status_code=409, detail="This contact is already saved")
    contact = EmergencyContact(account_id=account.id, label=data.label, contact_type=data.contact_type, value=data.value)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return _contact_json(contact)

@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: int, db: Session = Depends(get_db), account: Account = Depends(require_roles("USER"))):
    contact = db.query(EmergencyContact).filter_by(id=contact_id, account_id=account.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    db.delete(contact)
    db.commit()
