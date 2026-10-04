from typing import List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.hospital import HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.resource import ResourceCreate, ResourceResponse
from app.services import hospital_service
from app.websocket import WebSocketEvents, broadcast_event_sync

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])

@router.get("", response_model=List[HospitalResponse], summary="List all hospitals")
def list_hospitals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Retrieve a list of hospitals with their resources."""
    return hospital_service.get_hospitals(db, skip=skip, limit=limit)

@router.get("/{hospital_id}", response_model=HospitalResponse, summary="Get hospital by ID")
def get_hospital(hospital_id: int, db: Session = Depends(get_db)):
    """Retrieve details of a specific hospital by ID."""
    hospital = hospital_service.get_hospital_by_id(db, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    return hospital

@router.post("", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED, summary="Create a new hospital")
def create_hospital(hospital_in: HospitalCreate, db: Session = Depends(get_db)):
    """Create a new hospital record."""
    return hospital_service.create_hospital(db, hospital_in)

@router.patch("/{hospital_id}", response_model=HospitalResponse, summary="Update hospital details")
def update_hospital(hospital_id: int, hospital_in: HospitalUpdate, db: Session = Depends(get_db)):
    """Update details of a specific hospital."""
    hospital = hospital_service.get_hospital_by_id(db, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    update_data = hospital_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(hospital, field, value)
    db.commit()
    db.refresh(hospital)

    broadcast_event_sync(
        WebSocketEvents.HOSPITAL_STATUS_UPDATED,
        {
            "hospital_id": hospital.id,
            "name": hospital.name,
            "status": hospital.status
        }
    )
    return hospital

@router.post("/{hospital_id}/make-stale", summary="Simulate stale hospital data")
def make_hospital_stale(hospital_id: int, db: Session = Depends(get_db)):
    """Set last_updated timestamp for hospital resources to 15 minutes ago."""
    hospital = hospital_service.get_hospital_by_id(db, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    stale_time = datetime.now(timezone.utc) - timedelta(minutes=15)
    for res in hospital.resources:
        res.last_updated = stale_time
    db.commit()
    return {"message": f"Hospital {hospital_id} resources set to stale (15m ago)"}

@router.get("/{hospital_id}/resources", response_model=List[ResourceResponse], summary="Get hospital resources")
def get_hospital_resources(hospital_id: int, db: Session = Depends(get_db)):
    """Get all resource availability records for a specific hospital."""
    return hospital_service.get_hospital_resources(db, hospital_id)

@router.post("/{hospital_id}/resources", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED, summary="Add or update hospital resource")
def add_hospital_resource(
    hospital_id: int,
    resource_in: ResourceCreate,
    db: Session = Depends(get_db)
):
    """Add a new resource type or update an existing resource for a hospital."""
    return hospital_service.add_or_update_hospital_resource(db, hospital_id, resource_in)
