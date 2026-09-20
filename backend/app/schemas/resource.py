from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator, ConfigDict
from app.models.resource import ResourceType

class ResourceBase(BaseModel):
    resource_type: ResourceType
    total: int = Field(default=0, ge=0, description="Total capacity of this resource type")
    available: int = Field(default=0, ge=0, description="Currently available count")
    reserved: int = Field(default=0, ge=0, description="Currently reserved count")

    @model_validator(mode="after")
    def validate_available_reserved_total(self):
        if self.available + self.reserved > self.total:
            raise ValueError(
                f"Available ({self.available}) + Reserved ({self.reserved}) cannot exceed Total ({self.total})"
            )
        return self

class ResourceCreate(ResourceBase):
    pass

class ResourceUpdate(BaseModel):
    total: Optional[int] = Field(default=None, ge=0)
    available: Optional[int] = Field(default=None, ge=0)
    reserved: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_totals_if_present(self):
        return self

class ResourceResponse(ResourceBase):
    id: int
    hospital_id: int
    last_updated: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
