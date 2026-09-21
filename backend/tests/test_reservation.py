import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import concurrent.futures
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.database import SessionLocal
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencySeverity, EmergencyStatus
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus
from app.models.reservation import Reservation, ReservationStatus

client = TestClient(app)

def uid() -> str:
    return uuid.uuid4().hex[:8].upper()

def test_1_create_allocation_request():
    """1. Test creating an allocation request."""
    db = SessionLocal()
    try:
        # Setup Hospital
        h = Hospital(name=f"Request Test Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        res = HospitalResource(hospital_id=h.id, resource_type=ResourceType.ICU_BED, total=5, available=5, reserved=0)
        db.add(res)

        # Setup Emergency
        case_num = f"ER-REQ-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.HIGH, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        req = EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.ICU_BED, quantity=1, required=True)
        db.add(req)
        db.commit()

        # Create request via API
        response = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        assert response.status_code == 201
        data = response.json()
        assert data["emergency_case_id"] == e.id
        assert data["hospital_id"] == h.id
        assert data["status"] == "PENDING"
        assert data["match_score"] > 0
    finally:
        db.close()

def test_2_and_4_and_5_accept_request_creates_reservations_and_updates_availability():
    """2, 4, 5. Test hospital accepting request, creating reservations and updating resource quantities."""
    db = SessionLocal()
    try:
        h = Hospital(name=f"Accept Test Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        r1 = HospitalResource(hospital_id=h.id, resource_type=ResourceType.ICU_BED, total=5, available=3, reserved=1)
        r2 = HospitalResource(hospital_id=h.id, resource_type=ResourceType.VENTILATOR, total=3, available=2, reserved=0)
        db.add_all([r1, r2])

        case_num = f"ER-ACC-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.CRITICAL, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add_all([
            EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.ICU_BED, quantity=2, required=True),
            EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.VENTILATOR, quantity=1, required=True)
        ])
        db.commit()

        # Create request
        req_res = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        assert req_res.status_code == 201
        request_id = req_res.json()["id"]

        # Accept request
        acc_res = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc_res.status_code == 200
        acc_data = acc_res.json()
        assert acc_data["status"] == "ACCEPTED"
        assert len(acc_data["reservations"]) == 2

        # Verify DB state updates
        db.refresh(r1)
        db.refresh(r2)
        db.refresh(e)
        assert r1.available == 1  # 3 - 2 = 1
        assert r1.reserved == 3   # 1 + 2 = 3
        assert r2.available == 1  # 2 - 1 = 1
        assert r2.reserved == 1   # 0 + 1 = 1
        assert e.status == "HOSPITAL_SELECTED"

        # Verify Reservations API
        res_api = client.get(f"/api/emergencies/{e.id}/reservations")
        assert res_api.status_code == 200
        assert len(res_api.json()) == 2
    finally:
        db.close()

def test_3_reject_request():
    """3. Test hospital rejecting an allocation request."""
    db = SessionLocal()
    try:
        h = Hospital(name=f"Reject Test Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        db.add(HospitalResource(hospital_id=h.id, resource_type=ResourceType.GENERAL_BED, total=5, available=5, reserved=0))

        case_num = f"ER-REJ-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.LOW, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add(EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.GENERAL_BED, quantity=1, required=True))
        db.commit()

        req_res = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        request_id = req_res.json()["id"]

        rej_res = client.post(f"/api/allocation-requests/{request_id}/reject", json={"reason": "ICU resource no longer available"})
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "REJECTED"
        assert rej_res.json()["rejection_reason"] == "ICU resource no longer available"
    finally:
        db.close()

def test_6_cannot_accept_request_twice():
    """6. Cannot accept the same request twice (409 Conflict)."""
    db = SessionLocal()
    try:
        h = Hospital(name=f"Double Accept Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        db.add(HospitalResource(hospital_id=h.id, resource_type=ResourceType.OXYGEN_BED, total=5, available=5, reserved=0))

        case_num = f"ER-DBL-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.MODERATE, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add(EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.OXYGEN_BED, quantity=1, required=True))
        db.commit()

        req_res = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        request_id = req_res.json()["id"]

        # Accept 1st time
        acc1 = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc1.status_code == 200

        # Accept 2nd time
        acc2 = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc2.status_code == 409
        assert "already been accepted" in acc2.json()["detail"]
    finally:
        db.close()

def test_7_cannot_accept_expired_request():
    """7. Cannot accept an expired request."""
    db = SessionLocal()
    try:
        h = Hospital(name=f"Expired Test Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        db.add(HospitalResource(hospital_id=h.id, resource_type=ResourceType.ICU_BED, total=5, available=5, reserved=0))

        case_num = f"ER-EXP-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.HIGH, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add(EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.ICU_BED, quantity=1, required=True))
        db.commit()

        req_res = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        request_id = req_res.json()["id"]

        # Manually expire request in DB
        request_obj = db.query(AllocationRequest).filter(AllocationRequest.id == request_id).first()
        request_obj.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

        # Attempt to accept
        acc_res = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc_res.status_code == 409
        assert "expired" in acc_res.json()["detail"]
    finally:
        db.close()

def test_8_resource_unavailable_acceptance_fails():
    """8. Acceptance fails when resources are no longer available."""
    db = SessionLocal()
    try:
        h = Hospital(name=f"Lacking Capacity Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        res_obj = HospitalResource(hospital_id=h.id, resource_type=ResourceType.VENTILATOR, total=2, available=1, reserved=1)
        db.add(res_obj)

        case_num = f"ER-UNAVAIL-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.CRITICAL, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add(EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.VENTILATOR, quantity=1, required=True))
        db.commit()

        req_res = client.post(f"/api/emergencies/{e.id}/requests", json={"hospital_id": h.id})
        request_id = req_res.json()["id"]

        # Deplete available ventilators to 0
        res_obj.available = 0
        db.commit()

        acc_res = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc_res.status_code == 409
        assert "RESOURCE_UNAVAILABLE" in acc_res.json()["detail"]
    finally:
        db.close()

def test_9_multi_resource_atomic_reservation():
    """
    9. Multi-resource reservation is atomic.
    Hospital has ICU=1, VENTILATOR=0.
    Emergency requires ICU=1, VENTILATOR=1.
    Accept fails, ICU available remains 1, reserved remains 0. Nothing partial reserved.
    """
    db = SessionLocal()
    try:
        h = Hospital(name=f"Atomic Hospital {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        r1 = HospitalResource(hospital_id=h.id, resource_type=ResourceType.ICU_BED, total=1, available=1, reserved=0)
        r2 = HospitalResource(hospital_id=h.id, resource_type=ResourceType.VENTILATOR, total=1, available=0, reserved=1)
        db.add_all([r1, r2])

        case_num = f"ER-ATOMIC-{uid()}"
        e = EmergencyCase(severity=EmergencySeverity.CRITICAL, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case_num)
        db.add(e)
        db.flush()
        db.add_all([
            EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.ICU_BED, quantity=1, required=True),
            EmergencyRequirement(emergency_case_id=e.id, resource_type=ResourceType.VENTILATOR, quantity=1, required=True)
        ])
        db.commit()

        # Manually create request (bypassing initial check to test atomic accept behavior)
        req_obj = AllocationRequest(emergency_case_id=e.id, hospital_id=h.id, status=AllocationRequestStatus.PENDING, match_score=100.0)
        db.add(req_obj)
        db.commit()
        request_id = req_obj.id

        # Attempt to accept
        acc_res = client.post(f"/api/allocation-requests/{request_id}/accept")
        assert acc_res.status_code == 409

        # Verify Atomic Rollback: ICU_BED was NOT partially reserved
        db.refresh(r1)
        assert r1.available == 1
        assert r1.reserved == 0
    finally:
        db.close()

def test_10_11_12_13_concurrent_double_booking_protection():
    """
    10, 11, 12, 13. Concurrency double-booking protection:
    Initial state: Hospital A has ICU_BED total=1, available=1, reserved=0.
    Two emergencies ER-CONC-1 and ER-CONC-2 both require ICU_BED=1.
    Attempt to accept both requests concurrently.
    Guarantees:
    - Exactly ONE request succeeds (ACCEPTED).
    - Exactly ONE request fails (409 Conflict).
    - Exactly ONE ICU bed is reserved (total=1, available=0, reserved=1).
    - available + reserved <= total holds.
    - available >= 0 holds.
    """
    db = SessionLocal()
    try:
        h = Hospital(name=f"Concurrency Hospital A {uid()}", latitude=Decimal("37.77"), longitude=Decimal("-122.41"), status="Active")
        db.add(h)
        db.flush()
        icu_res = HospitalResource(hospital_id=h.id, resource_type=ResourceType.ICU_BED, total=1, available=1, reserved=0)
        db.add(icu_res)

        case1_num = f"ER-CONC1-{uid()}"
        case2_num = f"ER-CONC2-{uid()}"
        e1 = EmergencyCase(severity=EmergencySeverity.CRITICAL, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case1_num)
        e2 = EmergencyCase(severity=EmergencySeverity.CRITICAL, pickup_latitude=Decimal("37.77"), pickup_longitude=Decimal("-122.41"), case_number=case2_num)
        db.add_all([e1, e2])
        db.flush()

        db.add_all([
            EmergencyRequirement(emergency_case_id=e1.id, resource_type=ResourceType.ICU_BED, quantity=1, required=True),
            EmergencyRequirement(emergency_case_id=e2.id, resource_type=ResourceType.ICU_BED, quantity=1, required=True),
        ])
        db.commit()

        # Create two pending requests
        req1 = client.post(f"/api/emergencies/{e1.id}/requests", json={"hospital_id": h.id}).json()["id"]
        req2 = client.post(f"/api/emergencies/{e2.id}/requests", json={"hospital_id": h.id}).json()["id"]

        # Run concurrent acceptance in two parallel threads
        def send_accept(req_id):
            return client.post(f"/api/allocation-requests/{req_id}/accept")

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(send_accept, req1)
            f2 = executor.submit(send_accept, req2)
            res1 = f1.result()
            res2 = f2.result()

        status_codes = [res1.status_code, res2.status_code]

        # Exactly ONE should succeed (200), ONE should fail (409)
        assert 200 in status_codes
        assert 409 in status_codes

        # Re-verify DB state
        db.refresh(icu_res)
        assert icu_res.total == 1
        assert icu_res.available == 0
        assert icu_res.reserved == 1
        assert icu_res.available >= 0
        assert icu_res.available + icu_res.reserved <= icu_res.total

    finally:
        db.close()
