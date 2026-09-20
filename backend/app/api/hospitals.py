from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.hospital import HospitalCreate, HospitalResponse
from app.schemas.resource import ResourceCreate, ResourceResponse
from app.services import hospital_service

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
