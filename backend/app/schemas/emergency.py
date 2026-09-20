from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict
from app.models.emergency import EmergencySeverity, EmergencyStatus
from app.models.resource import ResourceType

class EmergencyRequirementBase(BaseModel):
    resource_type: ResourceType
    quantity: int = Field(..., gt=0, description="Quantity required must be greater than 0")
    required: bool = Field(default=True)

class EmergencyRequirementCreate(EmergencyRequirementBase):
    pass

class EmergencyRequirementResponse(EmergencyRequirementBase):
    id: int
    emergency_case_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class EmergencyCaseBase(BaseModel):
    severity: EmergencySeverity
    patient_age: Optional[int] = Field(default=None, ge=0, le=120, description="Patient age between 0 and 120")
    description: Optional[str] = Field(default=None, max_length=500)
    pickup_latitude: Decimal = Field(..., ge=-90, le=90, description="Latitude between -90 and 90")
    pickup_longitude: Decimal = Field(..., ge=-180, le=180, description="Longitude between -180 and 180")

class EmergencyCaseCreate(EmergencyCaseBase):
    case_number: Optional[str] = Field(default=None, max_length=50, description="Optional custom case number; generated automatically if omitted")
    requirements: List[EmergencyRequirementCreate] = Field(
        ...,
        min_length=1,
        description="At least one resource requirement is required"
    )

class EmergencyCaseStatusUpdate(BaseModel):
    status: EmergencyStatus

class EmergencyCaseResponse(EmergencyCaseBase):
    id: int
    case_number: str
    status: EmergencyStatus
    created_at: datetime
    updated_at: datetime
    requirements: List[EmergencyRequirementResponse] = []

    model_config = ConfigDict(from_attributes=True)
