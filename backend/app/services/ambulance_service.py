from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.ambulance import Ambulance, AmbulanceStatus
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.handoff import Handoff, HandoffStatus
from app.websocket import WebSocketEvents, broadcast_event_sync

def get_all_ambulances(db: Session) -> List[Ambulance]:
    return db.query(Ambulance).all()

def get_ambulance_by_id(db: Session, ambulance_id: int) -> Ambulance:
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ambulance with id {ambulance_id} not found"
        )
    return ambulance

def get_accepted_hospital_id(db: Session, emergency_id: int) -> Optional[int]:
    req = db.query(AllocationRequest).filter(
        AllocationRequest.emergency_case_id == emergency_id,
        AllocationRequest.status == AllocationRequestStatus.ACCEPTED
    ).first()
    return req.hospital_id if req else None

def assign_ambulance_to_emergency(db: Session, emergency_id: int, ambulance_id: int) -> EmergencyCase:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    # 1. Validation: emergency must have a selected hospital
    accepted_hospital_id = get_accepted_hospital_id(db, emergency_id)
    if not accepted_hospital_id and emergency.status not in [
        EmergencyStatus.HOSPITAL_SELECTED,
        EmergencyStatus.EN_ROUTE,
        EmergencyStatus.ARRIVED,
        EmergencyStatus.HANDOFF_COMPLETED
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency case must have a selected/accepted hospital before assigning an ambulance"
        )

    if emergency.status in [EmergencyStatus.HANDOFF_COMPLETED, EmergencyStatus.CANCELLED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot assign ambulance to emergency with status '{emergency.status.value}'"
        )

    # 2. Validation: ambulance must exist
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ambulance with id {ambulance_id} not found"
        )

    # 3. Validation: ambulance must be AVAILABLE
    if ambulance.status != AmbulanceStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ambulance '{ambulance.vehicle_number}' is not available (Current status: {ambulance.status.value})"
        )

    # 4. Validation: ambulance cannot already be assigned to another active emergency
    active_assignment = db.query(EmergencyCase).filter(
        EmergencyCase.assigned_ambulance_id == ambulance.id,
        EmergencyCase.status.in_([EmergencyStatus.EN_ROUTE, EmergencyStatus.ARRIVED])
    ).first()
    if active_assignment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ambulance '{ambulance.vehicle_number}' is already assigned to active emergency #{active_assignment.id}"
        )

    # State update:
    # Emergency: HOSPITAL_SELECTED -> EN_ROUTE
    # Ambulance: AVAILABLE -> ASSIGNED -> EN_ROUTE
    emergency.assigned_ambulance_id = ambulance.id
    emergency.status = EmergencyStatus.EN_ROUTE
    ambulance.status = AmbulanceStatus.EN_ROUTE

    db.commit()
    db.refresh(emergency)
    db.refresh(ambulance)

    # Broadcast WebSocket events strictly AFTER DB commit
    broadcast_event_sync(
        WebSocketEvents.AMBULANCE_ASSIGNED,
        {
            "ambulance_id": ambulance.id,
            "vehicle_number": ambulance.vehicle_number,
            "emergency_id": emergency.id,
            "hospital_id": accepted_hospital_id
        }
    )
    broadcast_event_sync(
        WebSocketEvents.AMBULANCE_STATUS_UPDATED,
        {
            "ambulance_id": ambulance.id,
            "vehicle_number": ambulance.vehicle_number,
            "status": ambulance.status.value if hasattr(ambulance.status, 'value') else str(ambulance.status),
            "emergency_id": emergency.id
        }
    )
    broadcast_event_sync(
        WebSocketEvents.EMERGENCY_STATUS_UPDATED,
        {
            "emergency_id": emergency.id,
            "status": emergency.status.value if hasattr(emergency.status, 'value') else str(emergency.status),
            "assigned_hospital_id": accepted_hospital_id,
            "assigned_ambulance_id": ambulance.id
        }
    )

    return emergency

def update_ambulance_status(db: Session, ambulance_id: int, new_status: AmbulanceStatus) -> Ambulance:
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ambulance with id {ambulance_id} not found"
        )

    allowed_statuses = [AmbulanceStatus.ASSIGNED, AmbulanceStatus.EN_ROUTE, AmbulanceStatus.ARRIVED]
    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status '{new_status.value}' is not allowed for manual status patch"
        )

    ambulance.status = new_status
    active_emergency = db.query(EmergencyCase).filter(
        EmergencyCase.assigned_ambulance_id == ambulance.id,
        EmergencyCase.status.in_([EmergencyStatus.EN_ROUTE, EmergencyStatus.ARRIVED])
    ).first()

    accepted_hospital_id = None
    handoff_created = False

    if new_status == AmbulanceStatus.ARRIVED and active_emergency:
        active_emergency.status = EmergencyStatus.ARRIVED
        accepted_hospital_id = get_accepted_hospital_id(db, active_emergency.id)

        # Create or update PENDING handoff record
        existing_handoff = db.query(Handoff).filter(Handoff.emergency_case_id == active_emergency.id).first()
        now = datetime.now(timezone.utc)
        if not existing_handoff and accepted_hospital_id:
            handoff = Handoff(
                emergency_case_id=active_emergency.id,
                hospital_id=accepted_hospital_id,
                ambulance_id=ambulance.id,
                arrival_time=now,
                status=HandoffStatus.PENDING
            )
            db.add(handoff)
            handoff_created = True

    db.commit()
    db.refresh(ambulance)
    if active_emergency:
        db.refresh(active_emergency)

    # Broadcast events
    broadcast_event_sync(
        WebSocketEvents.AMBULANCE_STATUS_UPDATED,
        {
            "ambulance_id": ambulance.id,
            "vehicle_number": ambulance.vehicle_number,
            "status": ambulance.status.value if hasattr(ambulance.status, 'value') else str(ambulance.status),
            "emergency_id": active_emergency.id if active_emergency else None
        }
    )

    if new_status == AmbulanceStatus.ARRIVED and active_emergency:
        broadcast_event_sync(
            WebSocketEvents.EMERGENCY_STATUS_UPDATED,
            {
                "emergency_id": active_emergency.id,
                "status": "ARRIVED"
            }
        )
        broadcast_event_sync(
            WebSocketEvents.AMBULANCE_ARRIVED,
            {
                "ambulance_id": ambulance.id,
                "vehicle_number": ambulance.vehicle_number,
                "emergency_id": active_emergency.id,
                "hospital_id": accepted_hospital_id,
                "case_number": active_emergency.case_number,
                "severity": active_emergency.severity.value if hasattr(active_emergency.severity, 'value') else str(active_emergency.severity)
            }
        )

    return ambulance

def start_handoff(db: Session, emergency_id: int) -> Handoff:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    # Validation: prevent starting handoff before arrival
    if emergency.status != EmergencyStatus.ARRIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start handoff before ambulance arrival (Current status: '{emergency.status.value}')"
        )

    accepted_hospital_id = get_accepted_hospital_id(db, emergency_id)
    handoff = db.query(Handoff).filter(Handoff.emergency_case_id == emergency_id).first()

    if not handoff:
        if not emergency.assigned_ambulance_id or not accepted_hospital_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create handoff: missing assigned ambulance or hospital"
            )
        handoff = Handoff(
            emergency_case_id=emergency_id,
            hospital_id=accepted_hospital_id,
            ambulance_id=emergency.assigned_ambulance_id,
            arrival_time=datetime.now(timezone.utc),
            status=HandoffStatus.PENDING
        )
        db.add(handoff)
        db.flush()

    if handoff.status != HandoffStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Handoff cannot be started from status '{handoff.status.value}'"
        )

    handoff.status = HandoffStatus.IN_PROGRESS
    db.commit()
    db.refresh(handoff)

    broadcast_event_sync(
        WebSocketEvents.HANDOFF_STARTED,
        {
            "handoff_id": handoff.id,
            "emergency_id": emergency_id,
            "hospital_id": handoff.hospital_id,
            "ambulance_id": handoff.ambulance_id,
            "status": "IN_PROGRESS"
        }
    )

    return handoff

def complete_handoff(db: Session, emergency_id: int, received_by: str, notes: Optional[str] = None) -> Handoff:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    handoff = db.query(Handoff).filter(Handoff.emergency_case_id == emergency_id).first()
    if not handoff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Handoff record not found for emergency id {emergency_id}"
        )

    # Validation: cannot complete handoff before it starts
    if handoff.status == HandoffStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete handoff before it starts (Must start handoff first)"
        )

    # Validation: cannot complete an already completed handoff
    if handoff.status == HandoffStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Handoff has already been completed"
        )

    now = datetime.now(timezone.utc)
    handoff.received_by = received_by
    handoff.notes = notes
    handoff.handoff_time = now
    handoff.status = HandoffStatus.COMPLETED

    # Emergency: ARRIVED -> HANDOFF_COMPLETED
    emergency.status = EmergencyStatus.HANDOFF_COMPLETED

    # Ambulance: ARRIVED -> AVAILABLE
    ambulance = db.query(Ambulance).filter(Ambulance.id == handoff.ambulance_id).first()
    if ambulance:
        ambulance.status = AmbulanceStatus.AVAILABLE

    db.commit()
    db.refresh(handoff)
    db.refresh(emergency)
    if ambulance:
        db.refresh(ambulance)

    # Broadcast WebSocket events
    broadcast_event_sync(
        WebSocketEvents.HANDOFF_COMPLETED,
        {
            "handoff_id": handoff.id,
            "emergency_id": emergency_id,
            "hospital_id": handoff.hospital_id,
            "ambulance_id": handoff.ambulance_id,
            "status": "COMPLETED",
            "received_by": handoff.received_by,
            "notes": handoff.notes
        }
    )
    broadcast_event_sync(
        WebSocketEvents.EMERGENCY_STATUS_UPDATED,
        {
            "emergency_id": emergency_id,
            "status": "HANDOFF_COMPLETED"
        }
    )
    if ambulance:
        broadcast_event_sync(
            WebSocketEvents.AMBULANCE_STATUS_UPDATED,
            {
                "ambulance_id": ambulance.id,
                "vehicle_number": ambulance.vehicle_number,
                "status": "AVAILABLE"
            }
        )

    return handoff

def get_handoff_for_emergency(db: Session, emergency_id: int) -> Handoff:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    handoff = db.query(Handoff).filter(Handoff.emergency_case_id == emergency_id).first()
    if not handoff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Handoff record not found for emergency case id {emergency_id}"
        )

    return handoff
