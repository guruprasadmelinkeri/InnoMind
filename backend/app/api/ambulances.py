from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.ambulance import AmbulanceRead, AmbulanceStatusUpdate
from app.services import ambulance_service
from app.core.auth import require_roles
from app.models.account import Account
from app.models.emergency import EmergencyCase
from app.models.allocation_request import AllocationRequest
from app.models.ambulance import Ambulance
from fastapi import HTTPException

router = APIRouter(prefix="/ambulances", tags=["Ambulances"])

@router.get("", response_model=List[AmbulanceRead], summary="List all ambulances")
def list_ambulances(db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL"))):
    """List all ambulances and their current status."""
    if account.role == "USER":
        ids = db.query(EmergencyCase.assigned_ambulance_id).filter(EmergencyCase.created_by_account_id == account.id, EmergencyCase.assigned_ambulance_id.isnot(None)).subquery()
        return db.query(Ambulance).filter(Ambulance.id.in_(ids)).all()
    if account.role == "HOSPITAL":
        ids = db.query(EmergencyCase.assigned_ambulance_id).join(AllocationRequest, AllocationRequest.emergency_case_id == EmergencyCase.id).filter(AllocationRequest.hospital_id == account.hospital_id, EmergencyCase.assigned_ambulance_id.isnot(None)).distinct().subquery()
        return db.query(Ambulance).filter(Ambulance.id.in_(ids)).all()
    # Ensure demo units are available even if this API server started before
    # the fleet provisioning change was deployed.
    ambulance_service.ensure_demo_ambulance_fleet(db)
    return ambulance_service.get_all_ambulances(db)

@router.get("/{ambulance_id}", response_model=AmbulanceRead, summary="Get ambulance by ID")
def get_ambulance(ambulance_id: int, db: Session = Depends(get_db), account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL"))):
    """Get details of a specific ambulance by ID."""
    if account.role != "ADMIN":
        emergency_query = db.query(EmergencyCase.id).filter(EmergencyCase.assigned_ambulance_id == ambulance_id)
        if account.role == "USER":
            emergency_query = emergency_query.filter(EmergencyCase.created_by_account_id == account.id)
        else:
            emergency_query = emergency_query.join(AllocationRequest, AllocationRequest.emergency_case_id == EmergencyCase.id).filter(AllocationRequest.hospital_id == account.hospital_id)
        if not emergency_query.first():
            raise HTTPException(status_code=404, detail="Ambulance not found")
    return ambulance_service.get_ambulance_by_id(db, ambulance_id)

@router.patch("/{ambulance_id}/status", response_model=AmbulanceRead, summary="Patch ambulance status")
def update_ambulance_status(
    ambulance_id: int,
    status_in: AmbulanceStatusUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Patch ambulance status (ASSIGNED, EN_ROUTE, ARRIVED)."""
    return ambulance_service.update_ambulance_status(db, ambulance_id, status_in.status)
