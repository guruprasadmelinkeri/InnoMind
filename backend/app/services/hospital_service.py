from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.hospital import Hospital
from app.models.resource import HospitalResource
from app.schemas.hospital import HospitalCreate
from app.schemas.resource import ResourceCreate

def get_hospitals(db: Session, skip: int = 0, limit: int = 100) -> List[Hospital]:
    return db.query(Hospital).offset(skip).limit(limit).all()

def get_hospital_by_id(db: Session, hospital_id: int) -> Optional[Hospital]:
    return db.query(Hospital).filter(Hospital.id == hospital_id).first()

def create_hospital(db: Session, hospital_in: HospitalCreate) -> Hospital:
    hospital = Hospital(
        name=hospital_in.name,
        address=hospital_in.address,
        latitude=hospital_in.latitude,
        longitude=hospital_in.longitude,
        emergency_level=hospital_in.emergency_level,
        trauma_center=hospital_in.trauma_center,
        status=hospital_in.status,
    )
    db.add(hospital)
    db.flush()  # populate hospital.id

    if hospital_in.resources:
        for res_in in hospital_in.resources:
            resource = HospitalResource(
                hospital_id=hospital.id,
                resource_type=res_in.resource_type,
                total=res_in.total,
                available=res_in.available,
                reserved=res_in.reserved,
            )
            db.add(resource)

    db.commit()
    db.refresh(hospital)
    return hospital

def get_hospital_resources(db: Session, hospital_id: int) -> List[HospitalResource]:
    hospital = get_hospital_by_id(db, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )
    return hospital.resources

def add_or_update_hospital_resource(
    db: Session,
    hospital_id: int,
    resource_in: ResourceCreate
) -> HospitalResource:
    hospital = get_hospital_by_id(db, hospital_id)
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hospital with id {hospital_id} not found"
        )

    # Check if available + reserved <= total
    if resource_in.available + resource_in.reserved > resource_in.total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Available ({resource_in.available}) + Reserved ({resource_in.reserved}) "
                f"cannot exceed Total ({resource_in.total})"
            )
        )

    # Check if resource already exists for this hospital
    existing_resource = (
        db.query(HospitalResource)
        .filter(
            HospitalResource.hospital_id == hospital_id,
            HospitalResource.resource_type == resource_in.resource_type
        )
        .first()
    )

    if existing_resource:
        existing_resource.total = resource_in.total
        existing_resource.available = resource_in.available
        existing_resource.reserved = resource_in.reserved
        db.commit()
        db.refresh(existing_resource)
        return existing_resource

    # Create new resource
    resource = HospitalResource(
        hospital_id=hospital_id,
        resource_type=resource_in.resource_type,
        total=resource_in.total,
        available=resource_in.available,
        reserved=resource_in.reserved,
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource
