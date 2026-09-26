from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.ambulance import AmbulanceRead, AmbulanceStatusUpdate
from app.services import ambulance_service

router = APIRouter(prefix="/ambulances", tags=["Ambulances"])

@router.get("", response_model=List[AmbulanceRead], summary="List all ambulances")
def list_ambulances(db: Session = Depends(get_db)):
    """List all ambulances and their current status."""
    return ambulance_service.get_all_ambulances(db)

@router.get("/{ambulance_id}", response_model=AmbulanceRead, summary="Get ambulance by ID")
def get_ambulance(ambulance_id: int, db: Session = Depends(get_db)):
    """Get details of a specific ambulance by ID."""
    return ambulance_service.get_ambulance_by_id(db, ambulance_id)

@router.patch("/{ambulance_id}/status", response_model=AmbulanceRead, summary="Patch ambulance status")
def update_ambulance_status(
    ambulance_id: int,
    status_in: AmbulanceStatusUpdate,
    db: Session = Depends(get_db)
):
    """Patch ambulance status (ASSIGNED, EN_ROUTE, ARRIVED)."""
    return ambulance_service.update_ambulance_status(db, ambulance_id, status_in.status)
