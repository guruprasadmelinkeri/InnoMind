from app.schemas.hospital import HospitalBase, HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.resource import ResourceBase, ResourceCreate, ResourceUpdate, ResourceResponse
from app.schemas.emergency import (
    EmergencyRequirementBase,
    EmergencyRequirementCreate,
    EmergencyRequirementResponse,
    EmergencyCaseBase,
    EmergencyCaseCreate,
    EmergencyCaseStatusUpdate,
    EmergencyCaseResponse,
)
from app.schemas.allocation import HospitalRecommendation, RecommendationResponse

__all__ = [
    "HospitalBase",
    "HospitalCreate",
    "HospitalUpdate",
    "HospitalResponse",
    "ResourceBase",
    "ResourceCreate",
    "ResourceUpdate",
    "ResourceResponse",
    "EmergencyRequirementBase",
    "EmergencyRequirementCreate",
    "EmergencyRequirementResponse",
    "EmergencyCaseBase",
    "EmergencyCaseCreate",
    "EmergencyCaseStatusUpdate",
    "EmergencyCaseResponse",
    "HospitalRecommendation",
    "RecommendationResponse",
]
