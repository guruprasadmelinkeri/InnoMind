from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencyStatus
from app.schemas.emergency import EmergencyCaseCreate, EmergencyCaseStatusUpdate
from app.websocket import WebSocketEvents, broadcast_event_sync

def generate_case_number(db: Session) -> str:
    """Generate sequential case number formatted as ER-000001, ER-000002, etc."""
    max_id = db.query(func.max(EmergencyCase.id)).scalar() or 0
    next_id = max_id + 1
    return f"ER-{next_id:06d}"

def get_emergency_cases(db: Session, skip: int = 0, limit: int = 100) -> List[EmergencyCase]:
    return db.query(EmergencyCase).offset(skip).limit(limit).all()

def get_emergency_case_by_id(db: Session, emergency_id: int) -> Optional[EmergencyCase]:
    return db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()

def create_emergency_case(db: Session, emergency_in: EmergencyCaseCreate) -> EmergencyCase:
    if not emergency_in.requirements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An emergency case must contain at least one resource requirement"
        )

    case_number = emergency_in.case_number
    if not case_number:
        case_number = generate_case_number(db)
    else:
        existing = db.query(EmergencyCase).filter(EmergencyCase.case_number == case_number).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Case number '{case_number}' already exists"
            )

    emergency = EmergencyCase(
        case_number=case_number,
        severity=emergency_in.severity,
        patient_age=emergency_in.patient_age,
        description=emergency_in.description,
        pickup_latitude=emergency_in.pickup_latitude,
        pickup_longitude=emergency_in.pickup_longitude,
        status=EmergencyStatus.CREATED,
    )
    db.add(emergency)
    db.flush()

    for req_in in emergency_in.requirements:
        if req_in.quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Resource quantity for '{req_in.resource_type}' must be greater than 0"
            )
        requirement = EmergencyRequirement(
            emergency_case_id=emergency.id,
            resource_type=req_in.resource_type,
            quantity=req_in.quantity,
            required=req_in.required,
        )
        db.add(requirement)

    db.commit()
    db.refresh(emergency)

    broadcast_event_sync(
        WebSocketEvents.EMERGENCY_STATUS_UPDATED,
        {
            "emergency_id": emergency.id,
            "case_number": emergency.case_number,
            "status": emergency.status.value if hasattr(emergency.status, 'value') else str(emergency.status)
        }
    )

    return emergency

def update_emergency_status(
    db: Session,
    emergency_id: int,
    status_update: EmergencyCaseStatusUpdate
) -> EmergencyCase:
    emergency = get_emergency_case_by_id(db, emergency_id)
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    emergency.status = status_update.status
    db.commit()
    db.refresh(emergency)

    broadcast_event_sync(
        WebSocketEvents.EMERGENCY_STATUS_UPDATED,
        {
            "emergency_id": emergency.id,
            "case_number": emergency.case_number,
            "status": emergency.status.value if hasattr(emergency.status, 'value') else str(emergency.status)
        }
    )

    return emergency

def delete_emergency_case(db: Session, emergency_id: int) -> bool:
    emergency = get_emergency_case_by_id(db, emergency_id)
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    db.delete(emergency)
    db.commit()
    return True

