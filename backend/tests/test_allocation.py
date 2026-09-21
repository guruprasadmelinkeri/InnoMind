from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.database import SessionLocal, engine, Base
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencySeverity, EmergencyStatus
from app.services.allocation.distance import (
    haversine_distance,
    calculate_travel_time,
    calculate_travel_score
)
from app.services.allocation.scoring import (
    calculate_resource_match,
    calculate_freshness,
    calculate_specialization,
    calculate_final_score,
    FreshnessStatus
)

client = TestClient(app)

# -------------------------------------------------------------------
# Unit Tests for Individual Allocation Components
# -------------------------------------------------------------------

def test_haversine_distance():
    # Distance between San Francisco (37.7749, -122.4194) and Oakland (37.8044, -122.2712) ~ 13.5 km
    dist = haversine_distance(37.7749, -122.4194, 37.8044, -122.2712)
    assert 12.0 < dist < 15.0

def test_travel_time_and_score():
    # 30 km at 30 km/h = 60 minutes travel time
    travel_min = calculate_travel_time(30.0, speed_kmh=30.0)
    assert travel_min == 60.0
    score_60min = calculate_travel_score(60.0, max_time_minutes=60.0)
    assert score_60min == 0.0

    # 15 km at 30 km/h = 30 minutes travel time -> 50 score
    travel_min_30 = calculate_travel_time(15.0, speed_kmh=30.0)
    assert travel_min_30 == 30.0
    score_30min = calculate_travel_score(30.0, max_time_minutes=60.0)
    assert score_30min == 50.0

def test_resource_match_calculation():
    resources = [
        HospitalResource(resource_type=ResourceType.ICU_BED, available=5),
        HospitalResource(resource_type=ResourceType.VENTILATOR, available=2),
    ]
    reqs_compatible = [
        EmergencyRequirement(resource_type=ResourceType.ICU_BED, quantity=1, required=True),
        EmergencyRequirement(resource_type=ResourceType.VENTILATOR, quantity=1, required=True),
    ]
    score, eligible, reasons = calculate_resource_match(resources, reqs_compatible)
    assert eligible is True
    assert score == 100.0
    assert "All required resources are available" in reasons[0]

    # Incompatible case: missing ventilator
    resources_lacking = [
        HospitalResource(resource_type=ResourceType.ICU_BED, available=5),
        HospitalResource(resource_type=ResourceType.VENTILATOR, available=0),
    ]
    score_inc, eligible_inc, reasons_inc = calculate_resource_match(resources_lacking, reqs_compatible)
    assert eligible_inc is False
    assert any("Required VENTILATOR is unavailable" in r for r in reasons_inc)

def test_freshness_calculation():
    now = datetime.now(timezone.utc)
    
    # 10s ago -> VERY_FRESH (100)
    res_fresh = [HospitalResource(last_updated=now - timedelta(seconds=10))]
    score, status, _ = calculate_freshness(res_fresh, now=now)
    assert score == 100.0
    assert status == FreshnessStatus.VERY_FRESH

    # 60s ago -> FRESH (80)
    res_60s = [HospitalResource(last_updated=now - timedelta(seconds=60))]
    score, status, _ = calculate_freshness(res_60s, now=now)
    assert score == 80.0
    assert status == FreshnessStatus.FRESH

    # 200s ago -> AGING (50)
    res_200s = [HospitalResource(last_updated=now - timedelta(seconds=200))]
    score, status, _ = calculate_freshness(res_200s, now=now)
    assert score == 50.0
    assert status == FreshnessStatus.AGING

    # 400s ago -> STALE (20)
    res_400s = [HospitalResource(last_updated=now - timedelta(seconds=400))]
    score, status, _ = calculate_freshness(res_400s, now=now)
    assert score == 20.0
    assert status == FreshnessStatus.STALE

def test_trauma_specialization_matching():
    hosp_trauma = Hospital(trauma_center=True)
    hosp_non_trauma = Hospital(trauma_center=False)
    case_critical = EmergencyCase(severity=EmergencySeverity.CRITICAL)

    score_t, reason_t = calculate_specialization(hosp_trauma, case_critical)
    assert score_t == 100.0
    assert "Trauma center available" in reason_t

    score_nt, reason_nt = calculate_specialization(hosp_non_trauma, case_critical)
    assert score_nt == 0.0
    assert "Hospital lacks certified trauma center" in reason_nt

def test_final_score_weighting():
    # 100*0.45 + 100*0.30 + 100*0.15 + 100*0.10 = 100.0
    final_perfect = calculate_final_score(100.0, 100.0, 100.0, 100.0)
    assert final_perfect == 100.0

    # 100*0.45 (45) + 50*0.30 (15) + 80*0.15 (12) + 0*0.10 (0) = 72.0
    final_mixed = calculate_final_score(100.0, 50.0, 80.0, 0.0)
    assert final_mixed == 72.0


# -------------------------------------------------------------------
# Integration Test for Hospital Ranking API Endpoint
# -------------------------------------------------------------------

def test_hospital_ranking_api_integration():
    """
    Integration test creating 3 distinct hospitals and an emergency requiring:
    - ICU_BED: 1
    - VENTILATOR: 1
    - TRAUMA_BED: 1
    Verifies that the recommendations API ranks eligible hospitals correctly,
    identifies ineligible hospitals, detects stale data, and provides distinct scores.
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)

    try:
        # Hospital 1: Alpha Trauma Center (Close, Full Match, Fresh, Trauma Center)
        h1 = Hospital(
            name="Alpha Trauma Center",
            address="100 Emergency Way",
            latitude=Decimal("37.775000"),
            longitude=Decimal("-122.419000"),
            emergency_level="Level 1",
            trauma_center=True,
            status="Active"
        )
        db.add(h1)
        db.flush()
        db.add_all([
            HospitalResource(hospital_id=h1.id, resource_type=ResourceType.ICU_BED, total=10, available=5, reserved=1, last_updated=now - timedelta(seconds=15)),
            HospitalResource(hospital_id=h1.id, resource_type=ResourceType.VENTILATOR, total=5, available=3, reserved=0, last_updated=now - timedelta(seconds=15)),
            HospitalResource(hospital_id=h1.id, resource_type=ResourceType.TRAUMA_BED, total=5, available=2, reserved=0, last_updated=now - timedelta(seconds=15)),
        ])

        # Hospital 2: Beta General (Medium Distance, Full Match, Stale Data, Non-Trauma)
        h2 = Hospital(
            name="Beta General Hospital",
            address="500 City Center Blvd",
            latitude=Decimal("37.800000"),
            longitude=Decimal("-122.390000"),
            emergency_level="Level 2",
            trauma_center=False,
            status="Active"
        )
        db.add(h2)
        db.flush()
        db.add_all([
            HospitalResource(hospital_id=h2.id, resource_type=ResourceType.ICU_BED, total=10, available=2, reserved=1, last_updated=now - timedelta(seconds=400)), # Stale (>300s)
            HospitalResource(hospital_id=h2.id, resource_type=ResourceType.VENTILATOR, total=5, available=1, reserved=0, last_updated=now - timedelta(seconds=400)),
            HospitalResource(hospital_id=h2.id, resource_type=ResourceType.TRAUMA_BED, total=5, available=1, reserved=0, last_updated=now - timedelta(seconds=400)),
        ])

        # Hospital 3: Gamma Clinic (Far, Missing Ventilator -> Ineligible)
        h3 = Hospital(
            name="Gamma Clinic",
            address="900 Suburb Rd",
            latitude=Decimal("37.850000"),
            longitude=Decimal("-122.300000"),
            emergency_level="Level 3",
            trauma_center=False,
            status="Active"
        )
        db.add(h3)
        db.flush()
        db.add_all([
            HospitalResource(hospital_id=h3.id, resource_type=ResourceType.ICU_BED, total=10, available=2, reserved=1, last_updated=now - timedelta(seconds=10)),
            HospitalResource(hospital_id=h3.id, resource_type=ResourceType.VENTILATOR, total=5, available=0, reserved=0, last_updated=now - timedelta(seconds=10)), # Missing!
            HospitalResource(hospital_id=h3.id, resource_type=ResourceType.TRAUMA_BED, total=5, available=2, reserved=0, last_updated=now - timedelta(seconds=10)),
        ])

        db.commit()

        # Create Emergency Case requiring ICU_BED, VENTILATOR, TRAUMA_BED
        req_payload = {
            "severity": "CRITICAL",
            "patient_age": 30,
            "description": "CRITICAL trauma case needing ICU, Ventilator, and Trauma bed",
            "pickup_latitude": 37.774900,
            "pickup_longitude": -122.419400,
            "requirements": [
                {"resource_type": "ICU_BED", "quantity": 1, "required": True},
                {"resource_type": "VENTILATOR", "quantity": 1, "required": True},
                {"resource_type": "TRAUMA_BED", "quantity": 1, "required": True},
            ]
        }
        create_res = client.post("/api/emergencies", json=req_payload)
        assert create_res.status_code == 201
        emergency_id = create_res.json()["id"]

        # Call GET /api/emergencies/{emergency_id}/recommendations
        rec_res = client.get(f"/api/emergencies/{emergency_id}/recommendations")
        assert rec_res.status_code == 200
        data = rec_res.json()

        assert "recommendations" in data
        assert "ineligible_hospitals" in data

        recommendations = data["recommendations"]
        ineligible = data["ineligible_hospitals"]

        # Alpha Trauma Center and Beta General should be in eligible recommendations
        eligible_names = [r["hospital_name"] for r in recommendations]
        assert "Alpha Trauma Center" in eligible_names
        assert "Beta General Hospital" in eligible_names

        # Gamma Clinic should be in ineligible_hospitals due to missing ventilator
        ineligible_names = [r["hospital_name"] for r in ineligible]
        assert "Gamma Clinic" in ineligible_names

        # Verify Alpha Trauma Center has a higher score than Beta General Hospital
        alpha_rec = next(r for r in recommendations if r["hospital_name"] == "Alpha Trauma Center")
        beta_rec = next(r for r in recommendations if r["hospital_name"] == "Beta General Hospital")
        gamma_rec = next(r for r in ineligible if r["hospital_name"] == "Gamma Clinic")

        assert alpha_rec["final_score"] > beta_rec["final_score"]
        assert alpha_rec["freshness_status"] == "VERY_FRESH"
        assert beta_rec["freshness_status"] == "STALE"

        # Verify reasons in ineligible hospital
        assert any("Required VENTILATOR is unavailable" in r for r in gamma_rec["reasons"])

    finally:
        db.close()
