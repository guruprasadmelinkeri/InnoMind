import enum
from datetime import datetime, timezone
from typing import List, Tuple, Dict, Any, Optional
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencySeverity

class FreshnessStatus(str, enum.Enum):
    VERY_FRESH = "VERY_FRESH"
    FRESH = "FRESH"
    AGING = "AGING"
    STALE = "STALE"

# Weighting configuration (Total = 1.0)
WEIGHT_RESOURCE_MATCH = 0.45
WEIGHT_TRAVEL = 0.30
WEIGHT_FRESHNESS = 0.15
WEIGHT_SPECIALIZATION = 0.10

def calculate_resource_match(
    hospital_resources: List[HospitalResource],
    requirements: List[EmergencyRequirement]
) -> Tuple[float, bool, List[str]]:
    """
    Calculate resource match score (0-100), eligibility, and human-readable reasons.
    A hospital is ineligible if any required resource (required=True) is unavailable.
    """
    if not requirements:
        return 100.0, True, ["No resource requirements specified"]

    resource_map: Dict[ResourceType, HospitalResource] = {
        res.resource_type: res for res in hospital_resources
    }

    total_requirements = len(requirements)
    satisfied_count = 0
    reasons: List[str] = []
    eligible = True

    for req in requirements:
        matched_res = resource_map.get(req.resource_type)
        avail = matched_res.available if matched_res else 0

        if avail >= req.quantity:
            satisfied_count += 1
            reasons.append(f"Required {req.resource_type.name} available ({avail}/{req.quantity})")
        else:
            if req.required:
                eligible = False
                reasons.append(f"Required {req.resource_type.name} is unavailable (Available: {avail}, Needed: {req.quantity})")
            else:
                reasons.append(f"Optional {req.resource_type.name} is partially unavailable (Available: {avail}, Needed: {req.quantity})")

    if eligible and satisfied_count == total_requirements:
        # Clean summary reason if all matched
        match_score = 100.0
        summary_reasons = ["All required resources are available"]
    else:
        match_score = round((satisfied_count / total_requirements) * 100.0, 2)
        summary_reasons = reasons

    return match_score, eligible, summary_reasons

def calculate_freshness(
    hospital_resources: List[HospitalResource],
    now: Optional[datetime] = None
) -> Tuple[float, FreshnessStatus, str]:
    """
    Calculate data freshness score (0-100), status, and explanation 
    based on the oldest last_updated timestamp among hospital resources.
    """
    if not hospital_resources:
        return 20.0, FreshnessStatus.STALE, "No resource data available"

    if now is None:
        now = datetime.now(timezone.utc)

    # Determine oldest updated resource
    timestamps = []
    for res in hospital_resources:
        ts = res.last_updated
        if ts is not None:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            timestamps.append(ts)

    if not timestamps:
        return 20.0, FreshnessStatus.STALE, "Resource update timestamps missing"

    oldest_ts = min(timestamps)
    age_seconds = (now - oldest_ts).total_seconds()
    if age_seconds < 0:
        age_seconds = 0.0

    if age_seconds <= 30:
        score = 100.0
        status = FreshnessStatus.VERY_FRESH
    elif age_seconds <= 120:
        score = 80.0
        status = FreshnessStatus.FRESH
    elif age_seconds <= 300:
        score = 50.0
        status = FreshnessStatus.AGING
    else:
        score = 20.0
        status = FreshnessStatus.STALE

    reason = f"Resource data updated {int(age_seconds)} seconds ago"
    return score, status, reason

def calculate_specialization(
    hospital: Hospital,
    emergency_case: EmergencyCase
) -> Tuple[float, str]:
    """
    Calculate trauma/specialization match score (0-100) and reason.
    """
    requires_trauma = (
        emergency_case.severity in [EmergencySeverity.CRITICAL, EmergencySeverity.HIGH] or
        any(req.resource_type == ResourceType.TRAUMA_BED for req in emergency_case.requirements) or
        ("trauma" in (emergency_case.description or "").lower())
    )

    if requires_trauma:
        if hospital.trauma_center:
            return 100.0, "Trauma center available"
        else:
            return 0.0, "Hospital lacks certified trauma center"
    else:
        if hospital.trauma_center:
            return 100.0, "Trauma center available"
        return 100.0, "Standard care capability matches emergency profile"

def calculate_final_score(
    resource_match_score: float,
    travel_score: float,
    freshness_score: float,
    specialization_score: float
) -> float:
    """
    Calculate weighted final score (0-100) rounded to 2 decimal places.
    """
    final = (
        (resource_match_score * WEIGHT_RESOURCE_MATCH) +
        (travel_score * WEIGHT_TRAVEL) +
        (freshness_score * WEIGHT_FRESHNESS) +
        (specialization_score * WEIGHT_SPECIALIZATION)
    )
    return round(max(0.0, min(100.0, final)), 2)
