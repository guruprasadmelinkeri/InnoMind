from typing import List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.hospital import Hospital
from app.models.emergency import EmergencyCase
from app.services.allocation.distance import (
    haversine_distance,
    calculate_travel_time,
    calculate_travel_score
)
from app.services.allocation.scoring import (
    calculate_resource_match,
    calculate_freshness,
    calculate_specialization,
    calculate_final_score
)

def rank_hospitals(db: Session, emergency_id: int) -> Dict[str, Any]:
    """
    Rank active hospitals for a given emergency case based on:
    1. Resource Match (45%)
    2. Travel Time / Distance (30%)
    3. Data Freshness (15%)
    4. Specialization / Trauma (10%)
    """
    emergency = db.query(EmergencyCase).filter(EmergencyCase.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case with id {emergency_id} not found"
        )

    active_hospitals = db.query(Hospital).filter(Hospital.status == "Active").all()

    eligible_recommendations: List[Dict[str, Any]] = []
    ineligible_hospitals: List[Dict[str, Any]] = []

    for hospital in active_hospitals:
        # 1. Distance & Travel Time Calculation
        if hospital.latitude is not None and hospital.longitude is not None:
            dist_km = haversine_distance(
                emergency.pickup_latitude,
                emergency.pickup_longitude,
                hospital.latitude,
                hospital.longitude
            )
        else:
            dist_km = 999.0  # Fallback penalty distance if coords missing

        travel_min = calculate_travel_time(dist_km)
        trv_score = calculate_travel_score(travel_min)

        # 2. Resource Match & Eligibility
        res_score, eligible, res_reasons = calculate_resource_match(
            hospital.resources,
            emergency.requirements
        )

        # 3. Data Freshness
        frsh_score, frsh_status, frsh_reason = calculate_freshness(hospital.resources)

        # 4. Specialization / Trauma Center Match
        spec_score, spec_reason = calculate_specialization(hospital, emergency)

        # 5. Final Score Calculation
        final_score = calculate_final_score(res_score, trv_score, frsh_score, spec_score)

        # Assemble Explainable Reasons List
        reasons: List[str] = []
        reasons.extend(res_reasons)
        if spec_reason:
            reasons.append(spec_reason)
        reasons.append(frsh_reason)
        reasons.append(f"Estimated travel time: {travel_min} minutes")

        eval_result = {
            "hospital_id": hospital.id,
            "hospital_name": hospital.name,
            "eligible": eligible,
            "final_score": final_score,
            "resource_match_score": res_score,
            "travel_score": trv_score,
            "freshness_score": frsh_score,
            "specialization_score": spec_score,
            "distance_km": dist_km,
            "estimated_travel_minutes": travel_min,
            "freshness_status": frsh_status.value,
            "reasons": reasons
        }

        if eligible:
            eligible_recommendations.append(eval_result)
        else:
            ineligible_hospitals.append(eval_result)

    # Sort eligible hospitals descending by final_score
    eligible_recommendations.sort(key=lambda x: x["final_score"], reverse=True)

    return {
        "emergency": emergency,
        "recommendations": eligible_recommendations,
        "ineligible_hospitals": ineligible_hospitals
    }
