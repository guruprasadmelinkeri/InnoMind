from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.emergency import (
    EmergencyCaseCreate,
    EmergencyCaseResponse,
    EmergencyCaseStatusUpdate
)
from app.services import emergency_service

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
