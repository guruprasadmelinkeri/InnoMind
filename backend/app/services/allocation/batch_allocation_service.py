"""
Batch allocation service for coordinating multiple emergency allocations.
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.hospital import Hospital
from app.models.emergency import EmergencyCase, EmergencySeverity
from app.models.resource import HospitalResource, ResourceType
from app.models.allocation_request import AllocationRequestStatus
from app.services.allocation import rank_hospitals, calculate_resource_match, calculate_travel_time, calculate_travel_score, calculate_freshness, calculate_specialization, calculate_final_score
from app.services.allocation.distance import haversine_distance
from app.services.allocation.scoring import WEIGHT_RESOURCE_MATCH, WEIGHT_TRAVEL, WEIGHT_FRESHNESS, WEIGHT_SPECIALIZATION

# Urgency weights for prioritization
URGENCY_WEIGHTS = {
    EmergencySeverity.LOW: 1,
    EmergencySeverity.MODERATE: 2,
    EmergencySeverity.HIGH: 3,
    EmergencySeverity.CRITICAL: 4,
}

def compute_pair_score(
    db: Session,
    emergency: EmergencyCase,
    hospital: Hospital,
) -> Tuple[float, bool, List[str], Dict[str, Any]]:
    """
    Compute score for emergency-hospital pair, similar to rank_hospitals but returns detailed info.
    Returns (score, eligible, reasons, details)
    """
    # Distance & Travel Time
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

    # Resource Match & Eligibility
    res_score, eligible, res_reasons = calculate_resource_match(
        hospital.resources,
        emergency.requirements
    )

    # Data Freshness
    frsh_score, frsh_status, frsh_reason = calculate_freshness(hospital.resources)

    # Specialization / Trauma Center Match
    spec_score, spec_reason = calculate_specialization(hospital, emergency)

    # Final Score Calculation
    final_score = calculate_final_score(res_score, trv_score, frsh_score, spec_score)

    # Assemble Explainable Reasons List
    reasons: List[str] = []
    reasons.extend(res_reasons)
    if spec_reason:
        reasons.append(spec_reason)
    reasons.append(frsh_reason)
    reasons.append(f"Estimated travel time: {travel_min} minutes")

    details = {
        "hospital_id": hospital.id,
        "hospital_name": hospital.name,
        "distance_km": dist_km,
        "estimated_travel_minutes": travel_min,
        "resource_match_score": res_score,
        "travel_score": trv_score,
        "freshness_score": frsh_score,
        "specialization_score": spec_score,
        "final_score": final_score,
        "freshness_status": frsh_status.value if hasattr(frsh_status, 'value') else str(frsh_status),
    }

    return final_score, eligible, reasons, details


def batch_allocate(
    db: Session,
    emergency_ids: List[int],
) -> Dict[str, Any]:
    """
    Perform batch allocation for multiple emergencies.
    Returns dict with assignments, unserved, explanations, and per-emergency details.
    """
    # Fetch emergencies
    emergencies = db.query(EmergencyCase).filter(EmergencyCase.id.in_(emergency_ids)).all()
    if len(emergencies) != len(emergency_ids):
        # Some emergencies not found
        found_ids = {e.id for e in emergencies}
        missing = set(emergency_ids) - found_ids
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency cases not found: {list(missing)}"
        )

    # Fetch active hospitals
    hospitals = db.query(Hospital).filter(Hospital.status == "Active").all()

    # Build eligibility matrix and scores
    # We'll store for each emergency a list of eligible hospitals with scores
    emergency_options: Dict[int, List[Dict[str, Any]]] = {}
    for emergency in emergencies:
        options = []
        for hospital in hospitals:
            score, eligible, reasons, details = compute_pair_score(db, emergency, hospital)
            if eligible:
                options.append({
                    "hospital": hospital,
                    "score": score,
                    "reasons": reasons,
                    "details": details,
                })
        # Sort options by score descending
        options.sort(key=lambda x: x["score"], reverse=True)
        emergency_options[emergency.id] = options

    # Now we need to assign hospitals to emergencies respecting resource capacities.
    # We'll use a greedy algorithm with urgency priority.
    # Sort emergencies by urgency (descending) then by ID for determinism.
    sorted_emergencies = sorted(
        emergencies,
        key=lambda e: (URGENCY_WEIGHTS[e.severity], e.id),
        reverse=True
    )

    # Track remaining resource capacities per hospital
    # We'll copy current available resources into a mutable dict
    hospital_resources: Dict[int, Dict[ResourceType, int]] = {}
    for hospital in hospitals:
        hospital_resources[hospital.id] = {}
        for res in hospital.resources:
            hospital_resources[hospital.id][res.resource_type] = res.available

    assignments: Dict[int, Optional[int]] = {}  # emergency_id -> hospital_id or None
    explanations: Dict[int, str] = {}
    assignment_details: Dict[int, Dict[str, Any]] = {}

    for emergency in sorted_emergencies:
        assigned = False
        for opt in emergency_options[emergency.id]:
            hospital = opt["hospital"]
            hid = hospital.id
            # Check if hospital has sufficient resources for this emergency's requirements
            sufficient = True
            for req in emergency.requirements:
                needed = req.quantity
                avail = hospital_resources[hid].get(req.resource_type, 0)
                if avail < needed:
                    sufficient = False
                    break
            if sufficient:
                # Assign
                assignments[emergency.id] = hid
                # Deduct resources
                for req in emergency.requirements:
                    hospital_resources[hid][req.resource_type] -= req.quantity
                # Build explanation
                explanations[emergency.id] = (
                    f"Assigned to Hospital {hospital.name} because the required resources were available "
                    f"and it had the best feasible ranking (score: {opt['score']:.2f})."
                )
                assignment_details[emergency.id] = opt["details"]
                assigned = True
                break
        if not assigned:
            assignments[emergency.id] = None
            # Determine reason for unserved
            if not emergency_options[emergency.id]:
                explanations[emergency.id] = "No compatible hospital met the patient's resource or specialization requirements."
            else:
                # Check if any hospital had resources but maybe not enough due to competition
                # We'll compute if any hospital had each required resource at start
                initial_avail: Dict[ResourceType, int] = {}
                for hospital in hospitals:
                    for res in hospital.resources:
                        rt = res.resource_type
                        initial_avail[rt] = initial_avail.get(rt, 0) + res.available
                # Check if any required resource insufficient overall
                insufficient_overall = False
                for req in emergency.requirements:
                    needed = req.quantity
                    avail = initial_avail.get(req.resource_type, 0)
                    if avail < needed:
                        insufficient_overall = True
                        break
                if insufficient_overall:
                    explanations[emergency.id] = (
                        f"Unserved due to insufficient capacity: required {req.resource_type.value} "
                        f"total availability {avail} < needed {needed}."
                    )
                else:
                    explanations[emergency.id] = (
                        "Compatible hospitals exist, but no required resource combination is available "
                        "due to competing allocations."
                    )

    # Build result
    results = []
    for emergency in emergencies:
        eid = emergency.id
        results.append({
            "emergency_id": eid,
            "emergency_case_number": emergency.case_number,
            "severity": emergency.severity.value if hasattr(emergency.severity, 'value') else str(emergency.severity),
            "assigned_hospital_id": assignments[eid],
            "assigned_hospital_name": (
                db.query(Hospital).filter(Hospital.id == assignments[eid]).first().name
                if assignments[eid] is not None else None
            ),
            "explanation": explanations[eid],
            "assignment_details": assignment_details.get(eid, {}),
            "status": "ASSIGNED" if assignments[eid] is not None else "UNSERVED",
        })

    return {
        "batch_id": None,  # Could generate a UUID if needed
        "results": results,
        "summary": {
            "total": len(emergencies),
            "assigned": sum(1 for r in results if r["status"] == "ASSIGNED"),
            "unserved": sum(1 for r in results if r["status"] == "UNSERVED"),
        }
    }