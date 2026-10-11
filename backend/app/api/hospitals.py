from typing import List
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.hospital import HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.resource import ResourceCreate, ResourceResponse
from app.services import hospital_service
from app.websocket import WebSocketEvents, broadcast_event_sync
from app.core.auth import require_roles, assert_hospital_scope
from app.models.account import Account
from app.models.resource import HospitalResource

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])


class AutomaticAllocationUpdate(BaseModel):
    enabled: bool


@router.patch("/automatic-allocation", summary="Set automatic allocation for every hospital")
def set_automatic_allocation_for_all(
    update: AutomaticAllocationUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    hospitals = db.query(hospital_service.Hospital).order_by(hospital_service.Hospital.id).with_for_update().all()
    for hospital in hospitals:
        hospital.automatic_resource_allocation = update.enabled
    db.commit()

    for hospital in hospitals:
        broadcast_event_sync(
            WebSocketEvents.HOSPITAL_STATUS_UPDATED,
            {
                "hospital_id": hospital.id,
                "name": hospital.name,
                "status": hospital.status,
                "automatic_resource_allocation": update.enabled,
            },
        )
    return {"enabled": update.enabled, "hospitals_updated": len(hospitals)}

@router.post("/refill-capacity", summary="Restore usable available capacity for demonstrations")
def refill_available_capacity(
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Refill availability without modifying total, reserved, or buffer counts."""
    resources = db.query(HospitalResource).order_by(HospitalResource.hospital_id, HospitalResource.id).with_for_update().all()

    # Validate the entire batch before changing anything so a bad record cannot
    # leave only some hospitals refilled.
    invalid = [r for r in resources if r.reserved + r.buffer > r.total]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Refill cancelled: one or more resources have reserved and buffer counts above total capacity.",
        )

    updated_hospitals = set()
    for resource in resources:
        resource.available = resource.total - resource.reserved - resource.buffer
        updated_hospitals.add(resource.hospital_id)
    db.commit()

    for resource in resources:
        broadcast_event_sync(
            WebSocketEvents.RESOURCE_UPDATED,
            {
                "hospital_id": resource.hospital_id,
                "resource_id": resource.id,
                "resource_type": resource.resource_type.value if hasattr(resource.resource_type, "value") else str(resource.resource_type),
                "total": resource.total,
                "available": resource.available,
                "reserved": resource.reserved,
                "buffer": resource.buffer,
                "last_updated": resource.last_updated.isoformat() if resource.last_updated else None,
            },
        )

    return {"hospitals_updated": len(updated_hospitals), "resources_updated": len(resources)}

@router.get("", response_model=List[HospitalResponse], summary="List all hospitals")
def list_hospitals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL"))):
    """Retrieve a list of hospitals with their resources."""
    if (account.role or "").upper() == "HOSPITAL":
        hospital = hospital_service.get_hospital_by_id(db, account.hospital_id)
        return [hospital] if hospital else []
    return hospital_service.get_hospitals(db, skip=skip, limit=limit)

@router.get("/{hospital_id}", response_model=HospitalResponse, summary="Get hospital by ID")
def get_hospital(hospital_id: int, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL"))):
    """Retrieve details of a specific hospital by ID."""
    hospital = hospital_service.get_hospital_by_id(db, hospital_id)
    assert_hospital_scope(account, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    return hospital

@router.post("", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED, summary="Create a new hospital")
def create_hospital(hospital_in: HospitalCreate, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN"))):
    """Create a new hospital record."""
    return hospital_service.create_hospital(db, hospital_in)

@router.patch("/{hospital_id}", response_model=HospitalResponse, summary="Update hospital details")
def update_hospital(hospital_id: int, hospital_in: HospitalUpdate, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "HOSPITAL"))):
    """Update details of a specific hospital."""
    hospital = hospital_service.get_hospital_by_id(db, hospital_id)
    assert_hospital_scope(account, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    update_data = hospital_in.model_dump(exclude_unset=True)
    if (account.role or "").upper() == "HOSPITAL" and set(update_data) - {"automatic_resource_allocation"}:
        raise HTTPException(status_code=403, detail="Hospital staff can only change automatic allocation settings")
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
def make_hospital_stale(hospital_id: int, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN"))):
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
def get_hospital_resources(hospital_id: int, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL"))):
    """Get all resource availability records for a specific hospital."""
    assert_hospital_scope(account, hospital_id)
    return hospital_service.get_hospital_resources(db, hospital_id)

@router.post("/{hospital_id}/resources", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED, summary="Add or update hospital resource")
def add_hospital_resource(
    hospital_id: int,
    resource_in: ResourceCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "HOSPITAL")),
):
    """Add a new resource type or update an existing resource for a hospital."""
    assert_hospital_scope(account, hospital_id)
    return hospital_service.add_or_update_hospital_resource(db, hospital_id, resource_in)
