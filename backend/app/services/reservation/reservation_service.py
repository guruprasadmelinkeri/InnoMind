from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import update
from fastapi import HTTPException, status

from app.models.hospital import Hospital
from app.models.resource import HospitalResource
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.reservation import Reservation, ReservationStatus
from app.services.allocation import calculate_resource_match

DEFAULT_REQUEST_EXPIRATION_MINUTES = 10

def get_allocation_request_by_id(db: Session, request_id: int) -> Optional[AllocationRequest]:
    return db.query(AllocationRequest).filter(AllocationRequest.id == request_id).first()

def get_allocation_requests_for_emergency(db: Session, emergency_id: int) -> List[AllocationRequest]:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )
    return db.query(AllocationRequest).filter(AllocationRequest.emergency_case_id == emergency_id).all()

def get_reservations_for_emergency(db: Session, emergency_id: int) -> List[Reservation]:
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )
    return db.query(Reservation).filter(Reservation.emergency_case_id == emergency_id).all()

def create_allocation_request(
    db: Session,
    emergency_id: int,
    hospital_id: int,
    expiration_minutes: int = DEFAULT_REQUEST_EXPIRATION_MINUTES
) -> AllocationRequest:
    """
    Create a new PENDING allocation request. Re-verifies current hospital resource eligibility.
    Does NOT reserve resources yet.
    """
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )

    if hospital.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hospital '{hospital.name}' is currently inactive"
        )

    # Re-verify resource match with CURRENT data
    match_score, eligible, reasons = calculate_resource_match(
        hospital.resources,
        emergency.requirements
    )

    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Hospital '{hospital.name}' is ineligible: {', '.join(reasons)}"
        )

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expiration_minutes)

    request = AllocationRequest(
        emergency_case_id=emergency_id,
        hospital_id=hospital_id,
        status=AllocationRequestStatus.PENDING,
        match_score=match_score,
        requested_at=now,
        expires_at=expires_at
    )

    db.add(request)
    db.commit()
    db.refresh(request)
    return request

def accept_allocation_request(db: Session, request_id: int) -> Dict[str, Any]:
    """
    Atomically reserve required resources for an allocation request using row-level locking 
    and atomic SQL UPDATE constraints.
    Guarantees all-or-nothing reservation within a single database transaction.
    """
    now = datetime.now(timezone.utc)

    # Fetch request
    request = db.query(AllocationRequest).filter(AllocationRequest.id == request_id).first()
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Allocation request with id {request_id} not found"
        )

    # 1. Duplicate Acceptance Check
    if request.status == AllocationRequestStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Allocation request has already been accepted"
        )

    # 2. Status Check
    if request.status != AllocationRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Allocation request cannot be accepted from status '{request.status.value}'"
        )

    # 3. Expiration Check
    if request.expires_at is not None:
        exp = request.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now > exp:
            request.status = AllocationRequestStatus.EXPIRED
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Allocation request has expired"
            )

    # 4. Emergency Already Assigned Check
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == request.emergency_case_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {request.emergency_case_id} not found"
        )

    if emergency.status in [EmergencyStatus.HOSPITAL_SELECTED, EmergencyStatus.EN_ROUTE, EmergencyStatus.ARRIVED, EmergencyStatus.HANDOFF_COMPLETED]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Emergency case is already assigned to a hospital"
        )

    # 5. Lock and Atomically Reserve Resources
    created_reservation_items: List[Dict[str, Any]] = []

    for req in emergency.requirements:
        # Atomic DB UPDATE enforcing available >= quantity
        stmt = (
            update(HospitalResource)
            .where(
                HospitalResource.hospital_id == request.hospital_id,
                HospitalResource.resource_type == req.resource_type,
                HospitalResource.available >= req.quantity
            )
            .values(
                available=HospitalResource.available - req.quantity,
                reserved=HospitalResource.reserved + req.quantity,
                last_updated=now
            )
        )
        res = db.execute(stmt)

        if res.rowcount == 0:
            # Atomic Failure: Rollback entire transaction
            db.rollback()
            # Read current availability for error detail
            current_res = db.query(HospitalResource).filter(
                HospitalResource.hospital_id == request.hospital_id,
                HospitalResource.resource_type == req.resource_type
            ).first()
            avail_qty = current_res.available if current_res else 0
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"RESOURCE_UNAVAILABLE: {req.resource_type.value} is no longer available (Available: {avail_qty}, Needed: {req.quantity})"
            )

        # Get resource_id for Reservation model
        res_row = db.query(HospitalResource).filter(
            HospitalResource.hospital_id == request.hospital_id,
            HospitalResource.resource_type == req.resource_type
        ).first()

        reservation = Reservation(
            emergency_case_id=emergency.id,
            hospital_id=request.hospital_id,
            resource_id=res_row.id,
            quantity=req.quantity,
            status=ReservationStatus.CONFIRMED,
            reserved_at=now
        )
        db.add(reservation)

        created_reservation_items.append({
            "resource_type": req.resource_type,
            "quantity": req.quantity
        })

    # Update Request and Emergency status
    request.status = AllocationRequestStatus.ACCEPTED
    request.responded_at = now
    emergency.status = EmergencyStatus.HOSPITAL_SELECTED

    db.commit()

    hospital = db.query(Hospital).filter(Hospital.id == request.hospital_id).first()
    hospital_name = hospital.name if hospital else f"Hospital #{request.hospital_id}"

    return {
        "request_id": request.id,
        "status": "ACCEPTED",
        "hospital_id": request.hospital_id,
        "hospital_name": hospital_name,
        "reservations": created_reservation_items
    }

def reject_allocation_request(
    db: Session,
    request_id: int,
    reason: str
) -> AllocationRequest:
    """
    Reject an allocation request with a given reason.
    """
    request = db.query(AllocationRequest).filter(AllocationRequest.id == request_id).first()
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Allocation request with id {request_id} not found"
        )

    if request.status != AllocationRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Allocation request cannot be rejected from status '{request.status.value}'"
        )

    now = datetime.now(timezone.utc)
    request.status = AllocationRequestStatus.REJECTED
    request.rejection_reason = reason
    request.responded_at = now

    db.commit()
    db.refresh(request)
    return request
