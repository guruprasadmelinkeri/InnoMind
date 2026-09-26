from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.handoff import HandoffStatus

class HandoffBase(BaseModel):
    emergency_case_id: int
    hospital_id: int
    ambulance_id: int

class HandoffRead(HandoffBase):
    id: int
    arrival_time: Optional[datetime] = None
    handoff_time: Optional[datetime] = None
    received_by: Optional[str] = None
    notes: Optional[str] = None
    status: HandoffStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class HandoffCompleteRequest(BaseModel):
    received_by: str
    notes: Optional[str] = None
