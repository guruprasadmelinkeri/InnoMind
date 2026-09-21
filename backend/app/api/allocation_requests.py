from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.reservation import (
    AllocationRequestResponse,
    AllocationRejectRequest,
    AcceptSuccessResponse
)
from app.services.reservation import (
    accept_allocation_request,
    reject_allocation_request,
    get_allocation_request_by_id
)

router = APIRouter(prefix="/allocation-requests", tags=["Allocation Requests"])

@router.get("/{request_id}", response_model=AllocationRequestResponse, summary="Get allocation request details")
def get_allocation_request(
    request_id: int,
    db: Session = Depends(get_db)
):
    """Retrieve details of a specific allocation request by ID."""
    request = get_allocation_request_by_id(db, request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Allocation request with id {request_id} not found"
        )
    return request

@router.post("/{request_id}/accept", response_model=AcceptSuccessResponse, summary="Accept allocation request & reserve resources")
def accept_request(
    request_id: int,
    db: Session = Depends(get_db)
):
    """
    Hospital accepts an emergency allocation request.
    Atomically verifies and reserves required resources in a single database transaction.
    """
    return accept_allocation_request(db, request_id)

@router.post("/{request_id}/reject", response_model=AllocationRequestResponse, summary="Reject allocation request")
def reject_request(
    request_id: int,
    reject_in: AllocationRejectRequest,
    db: Session = Depends(get_db)
):
    """Hospital rejects an emergency allocation request with a reason."""
    return reject_allocation_request(db, request_id, reason=reject_in.reason)
