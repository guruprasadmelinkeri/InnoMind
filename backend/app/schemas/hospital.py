from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field
from app.schemas.resource import ResourceCreate, ResourceResponse

class HospitalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Hospital name (required)")
    address: Optional[str] = Field(default=None, max_length=500)
    latitude: Optional[Decimal] = Field(default=None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(default=None, ge=-180, le=180)
    emergency_level: Optional[str] = Field(default="Level 1", max_length=50)
    trauma_center: bool = Field(default=False)
    status: str = Field(default="Active", max_length=50)

class HospitalCreate(HospitalBase):
    resources: Optional[List[ResourceCreate]] = Field(default_factory=list)

class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    address: Optional[str] = Field(default=None, max_length=500)
    latitude: Optional[Decimal] = Field(default=None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(default=None, ge=-180, le=180)
    emergency_level: Optional[str] = Field(default=None, max_length=50)
    trauma_center: Optional[bool] = Field(default=None)
    status: Optional[str] = Field(default=None, max_length=50)

class HospitalResponse(HospitalBase):
    id: int
    created_at: datetime
    updated_at: datetime
    resources: List[ResourceResponse] = []

    class Config:
        from_attributes = True
