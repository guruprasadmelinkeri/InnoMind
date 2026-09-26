from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.ambulance import AmbulanceStatus

class AmbulanceBase(BaseModel):
    vehicle_number: str
    status: AmbulanceStatus = AmbulanceStatus.AVAILABLE
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None

class AmbulanceCreate(AmbulanceBase):
    pass

class AmbulanceRead(AmbulanceBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AmbulanceAssignRequest(BaseModel):
    ambulance_id: int

class AmbulanceStatusUpdate(BaseModel):
    status: AmbulanceStatus
