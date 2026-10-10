from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.services.allocation.batch_allocation_service import batch_allocate
from app.core.auth import require_roles
from app.models.account import Account

router = APIRouter(prefix="/batch-allocation", tags=["Batch Allocation"])

@router.post("", summary="Perform batch allocation for multiple emergencies")
def perform_batch_allocation(
    emergency_ids: List[int],
    db: Session = Depends(get_db),
    account: Account = Depends(require_roles("ADMIN")),
):
    """
    Allocate multiple emergencies to hospitals considering competing demand.
    Returns assignments and explanations for each emergency.
    """
    return batch_allocate(db, emergency_ids)
