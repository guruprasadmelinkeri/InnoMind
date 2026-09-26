from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.emergency import EmergencySeverity
from app.models.resource import ResourceType

class EmergencyAnalyzeRequest(BaseModel):
    description: str = Field(..., min_length=3, description="Natural language description of the emergency incident")

class RequiredResourceItem(BaseModel):
    resource_type: ResourceType
    quantity: int = Field(default=1, ge=1)

class EmergencyAnalyzeResponse(BaseModel):
    severity: EmergencySeverity
    patient_age: Optional[int] = Field(default=None, ge=0, le=120)
    summary: str
    required_resources: List[RequiredResourceItem]
    reasoning: List[str]
