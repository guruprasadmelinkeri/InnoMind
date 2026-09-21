from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models.allocation_request import AllocationRequestStatus
from app.models.reservation import ReservationStatus
from app.models.resource import ResourceType

class AllocationRequestCreate(BaseModel):
    hospital_id: int = Field(..., description="Target hospital ID for allocation request")

class AllocationRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500, description="Rejection reason")

class AllocationRequestResponse(BaseModel):
    id: int
    emergency_case_id: int
    hospital_id: int
    status: AllocationRequestStatus
    match_score: float
    requested_at: datetime
    responded_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ReservationItem(BaseModel):
    resource_type: ResourceType
    quantity: int

class ReservationResponse(BaseModel):
    id: int
    emergency_case_id: int
    hospital_id: int
    resource_id: int
    quantity: int
    status: ReservationStatus
    reserved_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AcceptSuccessResponse(BaseModel):
    request_id: int
    status: str = "ACCEPTED"
    hospital_id: int
    hospital_name: str
    reservations: List[ReservationItem]
