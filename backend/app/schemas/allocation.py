from typing import List
from pydantic import BaseModel, ConfigDict
from app.schemas.emergency import EmergencyCaseResponse

class HospitalRecommendation(BaseModel):
    hospital_id: int
    hospital_name: str
    eligible: bool
    final_score: float
    resource_match_score: float
    travel_score: float
    freshness_score: float
    specialization_score: float
    distance_km: float
    estimated_travel_minutes: float
    freshness_status: str
    reasons: List[str]

    model_config = ConfigDict(from_attributes=True)

class RecommendationResponse(BaseModel):
    emergency: EmergencyCaseResponse
    recommendations: List[HospitalRecommendation]
    ineligible_hospitals: List[HospitalRecommendation] = []

    model_config = ConfigDict(from_attributes=True)
