from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.emergency import (
    EmergencyCaseCreate,
    EmergencyCaseResponse,
    EmergencyCaseStatusUpdate
)
from app.schemas.allocation import RecommendationResponse
from app.schemas.reservation import (
    AllocationRequestCreate,
    AllocationRequestResponse,
    ReservationResponse
)
from app.services import emergency_service
from app.services.allocation import rank_hospitals
from app.services.reservation import (
    create_allocation_request,
    get_allocation_requests_for_emergency,
    get_reservations_for_emergency
)

router = APIRouter(prefix="/emergencies", tags=["Emergencies"])

@router.post("", response_model=EmergencyCaseResponse, status_code=status.HTTP_201_CREATED, summary="Create emergency case")
def create_emergency(
    emergency_in: EmergencyCaseCreate,
    db: Session = Depends(get_db)
):
    """Create a new emergency case with its resource requirements."""
    return emergency_service.create_emergency_case(db, emergency_in)

@router.get("", response_model=List[EmergencyCaseResponse], summary="List emergency cases")
def list_emergencies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all emergency cases with their resource requirements."""
    return emergency_service.get_emergency_cases(db, skip=skip, limit=limit)

@router.get("/{emergency_id}", response_model=EmergencyCaseResponse, summary="Get emergency case by ID")
def get_emergency(
    emergency_id: int,
    db: Session = Depends(get_db)
):
    """Get details of a specific emergency case by ID."""
    emergency = emergency_service.get_emergency_case_by_id(db, emergency_id)
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )
    return emergency

@router.get("/{emergency_id}/recommendations", response_model=RecommendationResponse, summary="Get hospital recommendations")
def get_hospital_recommendations(
    emergency_id: int,
    db: Session = Depends(get_db)
):
    """
    Find suitable active hospitals for an emergency case and rank them based on:
    - Resource match (45%)
    - Travel distance/time (30%)
    - Data freshness (15%)
    - Trauma/specialization match (10%)
    """
    return rank_hospitals(db, emergency_id)

@router.post("/{emergency_id}/requests", response_model=AllocationRequestResponse, status_code=status.HTTP_201_CREATED, summary="Create allocation request to hospital")
def create_request_for_emergency(
    emergency_id: int,
    request_in: AllocationRequestCreate,
    db: Session = Depends(get_db)
):
    """Create an allocation request for an emergency case to a targeted hospital."""
    return create_allocation_request(db, emergency_id, request_in.hospital_id)

@router.get("/{emergency_id}/requests", response_model=List[AllocationRequestResponse], summary="Get allocation requests for emergency")
def get_emergency_requests(
    emergency_id: int,
    db: Session = Depends(get_db)
):
    """List all allocation requests created for an emergency case."""
    return get_allocation_requests_for_emergency(db, emergency_id)

@router.get("/{emergency_id}/reservations", response_model=List[ReservationResponse], summary="Get reservations for emergency")
def get_emergency_reservations(
    emergency_id: int,
    db: Session = Depends(get_db)
):
    """List all resource reservations created for an emergency case."""
    return get_reservations_for_emergency(db, emergency_id)

@router.patch("/{emergency_id}/status", response_model=EmergencyCaseResponse, summary="Update emergency status")
def update_emergency_status(
    emergency_id: int,
    status_update: EmergencyCaseStatusUpdate,
    db: Session = Depends(get_db)
):
    """Update the status of an emergency case."""
    return emergency_service.update_emergency_status(db, emergency_id, status_update)

@router.delete("/{emergency_id}", status_code=status.HTTP_200_OK, summary="Cancel/delete emergency case")
def delete_emergency(
    emergency_id: int,
    db: Session = Depends(get_db)
):
    """Cancel or delete an emergency case by ID."""
    emergency_service.delete_emergency_case(db, emergency_id)
    return {"status": "success", "message": f"Emergency case {emergency_id} has been cancelled"}
