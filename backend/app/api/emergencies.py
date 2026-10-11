from typing import List, Literal
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
from app.schemas.ambulance import AmbulanceAssignRequest
from app.schemas.handoff import HandoffRead, HandoffCompleteRequest
from app.services import emergency_service, ambulance_service
from app.services.automation_service import (
    auto_assign_ambulance_for_emergency,
    enable_auto_mode_for_emergencies,
    run_automated_emergency_workflow,
    schedule_automated_workflow,
    get_workflow_mode,
    set_workflow_mode,
    configure_workflow_mode_from_hospitals,
)
from app.services.allocation import rank_hospitals
from app.services.reservation import (
    create_allocation_request,
    get_allocation_requests_for_emergency,
    get_reservations_for_emergency
)
from app.core.auth import require_roles
from app.models.account import Account
from app.models.emergency import EmergencyCase, EmergencyStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.hospital import Hospital
from pydantic import BaseModel, Field

router = APIRouter(prefix="/emergencies", tags=["Emergencies"])


class WorkflowModeUpdate(BaseModel):
    mode: Literal["MANUAL", "AUTO"]


@router.get("/automation/mode", summary="Get dispatcher workflow mode")
def get_automation_mode(
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    return {"mode": configure_workflow_mode_from_hospitals(db)}


@router.put("/automation/mode", summary="Set dispatcher workflow mode")
def update_automation_mode(
    update: WorkflowModeUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    enabled = update.mode == "AUTO"
    hospitals = db.query(Hospital).order_by(Hospital.id).with_for_update().all()
    for hospital in hospitals:
        hospital.automatic_resource_allocation = enabled
    db.commit()
    set_workflow_mode(update.mode)
    return {"mode": update.mode, "hospitals_updated": len(hospitals)}

@router.post("/automation/run-pending", summary="Run automatic workflow for all pending emergencies")
def run_pending_automation(
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Run one-click admin automation for pending and hospital-selected emergencies."""
    set_workflow_mode("AUTO")
    pending_ids = [row[0] for row in db.query(EmergencyCase.id).filter(
        EmergencyCase.status.in_([EmergencyStatus.CREATED, EmergencyStatus.SEARCHING]),
        ~EmergencyCase.allocation_requests.any(
            AllocationRequest.status == AllocationRequestStatus.ACCEPTED
        ),
    ).order_by(EmergencyCase.created_at.asc()).all()]
    active_cases = db.query(EmergencyCase).filter(
        EmergencyCase.status.in_([
            EmergencyStatus.HOSPITAL_SELECTED,
            EmergencyStatus.EN_ROUTE,
            EmergencyStatus.ARRIVED,
        ])
    ).order_by(EmergencyCase.created_at.asc()).all()
    awaiting_ambulance_ids = [
        case.id
        for case in active_cases
        if case.status != EmergencyStatus.HOSPITAL_SELECTED or case.assigned_ambulance_id is None
    ]
    if not pending_ids and not awaiting_ambulance_ids:
        return {"status": "idle", "scheduled_emergencies": 0}

    enable_auto_mode_for_emergencies(set(pending_ids + awaiting_ambulance_ids))

    # Admin explicitly selected Auto Mode: schedule every eligible pending
    # case in the same debounced batch, including facilities that normally
    # require a manual response.
    for emergency_id in pending_ids:
        schedule_automated_workflow(emergency_id, auto_mode=True)

    for emergency_id in awaiting_ambulance_ids:
        try:
            auto_assign_ambulance_for_emergency(db, emergency_id)
        except HTTPException:
            # The service emits an intervention event when no safe assignment
            # is possible; keep processing the rest of the queue.
            continue

    return {
        "status": "scheduled",
        "scheduled_emergencies": len(pending_ids) + len(awaiting_ambulance_ids),
    }

def _scope_emergency(db: Session, emergency_id: int, account: Account) -> EmergencyCase:
    emergency = db.get(EmergencyCase, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency case not found")
    if account.role == "USER" and emergency.created_by_account_id != account.id:
        raise HTTPException(status_code=404, detail="Emergency case not found")
    if account.role == "HOSPITAL":
        from app.models.allocation_request import AllocationRequest
        allowed = db.query(AllocationRequest.id).filter(AllocationRequest.emergency_case_id == emergency_id, AllocationRequest.hospital_id == account.hospital_id).first()
        if not allowed:
            raise HTTPException(status_code=404, detail="Emergency case not found")
    return emergency

class DoctorAssignment(BaseModel):
    doctor_name: str = Field(min_length=1, max_length=160)

@router.post("", response_model=EmergencyCaseResponse, status_code=status.HTTP_201_CREATED, summary="Create emergency case")
def create_emergency(
    emergency_in: EmergencyCaseCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER")),
):
    """Create a new emergency case with its resource requirements."""
    emergency = emergency_service.create_emergency_case(db, emergency_in)
    emergency.created_by_account_id = account.id if account.role == "USER" else None
    db.commit()
    db.refresh(emergency)
    return emergency

@router.get("", response_model=List[EmergencyCaseResponse], summary="List emergency cases")
def list_emergencies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL")),
):
    """List all emergency cases with their resource requirements."""
    query = db.query(EmergencyCase)
    if account.role == "USER":
        query = query.filter(EmergencyCase.created_by_account_id == account.id)
    elif account.role == "HOSPITAL":
        from app.models.allocation_request import AllocationRequest
        query = query.join(AllocationRequest).filter(AllocationRequest.hospital_id == account.hospital_id).distinct()
    # Keep newly submitted incidents at the top of the Dispatcher queue. Without
    # an explicit order, databases may return the oldest 100 and hide new cases.
    return query.order_by(EmergencyCase.created_at.desc(), EmergencyCase.id.desc()).offset(skip).limit(limit).all()

@router.get("/{emergency_id}", response_model=EmergencyCaseResponse, summary="Get emergency case by ID")
def get_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL")),
):
    """Get details of a specific emergency case by ID."""
    emergency = emergency_service.get_emergency_case_by_id(db, emergency_id)
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )
    if account.role == "USER" and emergency.created_by_account_id != account.id:
        raise HTTPException(status_code=404, detail="Emergency case not found")
    return emergency

@router.get("/{emergency_id}/recommendations", response_model=RecommendationResponse, summary="Get hospital recommendations")
def get_hospital_recommendations(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER")),
):
    """
    Find suitable active hospitals for an emergency case and rank them based on:
    - Resource match (45%)
    - Travel distance/time (30%)
    - Data freshness (15%)
    - Trauma/specialization match (10%)
    """
    _scope_emergency(db, emergency_id, account)
    return rank_hospitals(db, emergency_id)

@router.post("/{emergency_id}/requests", response_model=AllocationRequestResponse, status_code=status.HTTP_201_CREATED, summary="Create allocation request to hospital")
def create_request_for_emergency(
    emergency_id: int,
    request_in: AllocationRequestCreate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Create an allocation request for an emergency case to a targeted hospital."""
    return create_allocation_request(db, emergency_id, request_in.hospital_id)

@router.get("/{emergency_id}/requests", response_model=List[AllocationRequestResponse], summary="Get allocation requests for emergency")
def get_emergency_requests(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL")),
):
    """List all allocation requests created for an emergency case."""
    _scope_emergency(db, emergency_id, account)
    requests = get_allocation_requests_for_emergency(db, emergency_id)
    return [r for r in requests if account.role != "HOSPITAL" or r.hospital_id == account.hospital_id]

@router.get("/{emergency_id}/reservations", response_model=List[ReservationResponse], summary="Get reservations for emergency")
def get_emergency_reservations(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL")),
):
    """List all resource reservations created for an emergency case."""
    _scope_emergency(db, emergency_id, account)
    reservations = get_reservations_for_emergency(db, emergency_id)
    return [r for r in reservations if account.role != "HOSPITAL" or r.hospital_id == account.hospital_id]

@router.post("/{emergency_id}/assign-ambulance", response_model=EmergencyCaseResponse, summary="Assign ambulance to emergency case")
def assign_ambulance(
    emergency_id: int,
    assign_in: AmbulanceAssignRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Assign an available ambulance to an emergency case."""
    return ambulance_service.assign_ambulance_to_emergency(db, emergency_id, assign_in.ambulance_id)

@router.post("/{emergency_id}/handoff/start", response_model=HandoffRead, summary="Start hospital handoff")
def start_handoff_api(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "HOSPITAL")),
):
    """Start patient handoff process upon ambulance arrival at hospital."""
    if account.role == "HOSPITAL": _scope_emergency(db, emergency_id, account)
    return ambulance_service.start_handoff(db, emergency_id)

@router.post("/{emergency_id}/handoff/complete", response_model=HandoffRead, summary="Complete hospital handoff")
def complete_handoff_api(
    emergency_id: int,
    handoff_in: HandoffCompleteRequest,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "HOSPITAL")),
):
    """Complete patient handoff at hospital and release ambulance."""
    if account.role == "HOSPITAL": _scope_emergency(db, emergency_id, account)
    return ambulance_service.complete_handoff(db, emergency_id, handoff_in.received_by, handoff_in.notes)

@router.get("/{emergency_id}/handoff", response_model=HandoffRead, summary="Get emergency handoff details")
def get_handoff_api(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "USER", "HOSPITAL")),
):
    """Get handoff status and details for an emergency case."""
    _scope_emergency(db, emergency_id, account)
    return ambulance_service.get_handoff_for_emergency(db, emergency_id)

@router.patch("/{emergency_id}/status", response_model=EmergencyCaseResponse, summary="Update emergency status")
def update_emergency_status(
    emergency_id: int,
    status_update: EmergencyCaseStatusUpdate,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Update the status of an emergency case."""
    return emergency_service.update_emergency_status(db, emergency_id, status_update)

@router.patch("/{emergency_id}/assigned-doctor", response_model=EmergencyCaseResponse, summary="Assign a receiving doctor")
def assign_doctor(
    emergency_id: int,
    assignment: DoctorAssignment,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN", "HOSPITAL")),
):
    emergency = _scope_emergency(db, emergency_id, account)
    if account.role == "HOSPITAL":
        accepted = db.query(AllocationRequest.id).filter(
            AllocationRequest.emergency_case_id == emergency_id,
            AllocationRequest.hospital_id == account.hospital_id,
            AllocationRequest.status == AllocationRequestStatus.ACCEPTED,
        ).first()
        if not accepted:
            raise HTTPException(status_code=409, detail="A doctor can be assigned after this hospital accepts the request")
    emergency.assigned_doctor_name = assignment.doctor_name.strip()
    db.commit()
    db.refresh(emergency)
    return emergency

@router.post("/{emergency_id}/automation/retry", summary="Retry automated emergency workflow")
def retry_automation(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Allow dispatcher override to re-run automated allocation and ambulance assignment safely."""
    return run_automated_emergency_workflow(db, emergency_id)

@router.delete("/{emergency_id}", status_code=status.HTTP_200_OK, summary="Cancel/delete emergency case")
def delete_emergency(
    emergency_id: int,
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """Cancel or delete an emergency case by ID."""
    emergency_service.delete_emergency_case(db, emergency_id)
    return {"status": "success", "message": f"Emergency case {emergency_id} has been cancelled"}

