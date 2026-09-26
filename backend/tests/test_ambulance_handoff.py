import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.main import app
from app.db.database import get_db, Base, engine
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencyStatus, EmergencySeverity
from app.models.ambulance import Ambulance, AmbulanceStatus
from app.models.handoff import Handoff, HandoffStatus

@pytest.fixture(scope="function")
def db_session():
    """Ensure database tables are created."""
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="function")
def client(db_session):
    return TestClient(app)

def create_sample_setup(db: Session):
    """Helper to create a hospital, emergency case with requirements, and an ambulance."""
    hospital = Hospital(
        name=f"Test Hosp {uuid.uuid4().hex[:4]}",
        address="100 Main St",
        latitude=37.7749,
        longitude=-122.4194,
        emergency_level="Level 1",
        trauma_center=True,
        status="Active"
    )
    db.add(hospital)
    db.flush()

    resource = HospitalResource(
        hospital_id=hospital.id,
        resource_type=ResourceType.ICU_BED,
        total=10,
        available=5,
        reserved=2,
        last_updated=datetime.now(timezone.utc)
    )
    db.add(resource)

    emergency = EmergencyCase(
        case_number=f"ER-AH-{uuid.uuid4().hex[:6]}",
        severity=EmergencySeverity.CRITICAL,
        patient_age=40,
        description="Ambulance & Handoff test case",
        pickup_latitude=37.7750,
        pickup_longitude=-122.4180,
        status=EmergencyStatus.CREATED
    )
    db.add(emergency)
    db.flush()

    requirement = EmergencyRequirement(
        emergency_case_id=emergency.id,
        resource_type=ResourceType.ICU_BED,
        quantity=1,
        required=True
    )
    db.add(requirement)

    ambulance = Ambulance(
        vehicle_number=f"MH12{uuid.uuid4().hex[:4].upper()}",
        status=AmbulanceStatus.AVAILABLE
    )
    db.add(ambulance)

    db.commit()
    db.refresh(hospital)
    db.refresh(emergency)
    db.refresh(ambulance)

    return hospital, emergency, ambulance

def test_1_assign_ambulance(client, db_session):
    """Test 1: Assign ambulance to emergency case with accepted hospital."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    # 1. Create and accept allocation request
    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    assert req_resp.status_code == 201
    req_id = req_resp.json()["id"]

    accept_resp = client.post(f"/api/allocation-requests/{req_id}/accept")
    assert accept_resp.status_code == 200

    # 2. Assign ambulance
    assign_resp = client.post(
        f"/api/emergencies/{emergency.id}/assign-ambulance",
        json={"ambulance_id": ambulance.id}
    )
    assert assign_resp.status_code == 200
    data = assign_resp.json()
    assert data["status"] == "EN_ROUTE"
    assert data["assigned_ambulance_id"] == ambulance.id

    # Check ambulance status
    amb_resp = client.get(f"/api/ambulances/{ambulance.id}")
    assert amb_resp.json()["status"] == "EN_ROUTE"

def test_2_cannot_assign_unavailable_ambulance(client, db_session):
    """Test 2: Cannot assign an ambulance that is not AVAILABLE."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    req_id = req_resp.json()["id"]
    client.post(f"/api/allocation-requests/{req_id}/accept")

    # Set ambulance status to OFFLINE
    client.patch(f"/api/ambulances/{ambulance.id}/status", json={"status": "ASSIGNED"})
    db_session.query(Ambulance).filter(Ambulance.id == ambulance.id).update({"status": AmbulanceStatus.OFFLINE})
    db_session.commit()

    assign_resp = client.post(
        f"/api/emergencies/{emergency.id}/assign-ambulance",
        json={"ambulance_id": ambulance.id}
    )
    assert assign_resp.status_code in [400, 409]
    assert "not available" in assign_resp.json()["detail"]

def test_3_ambulance_status_changes(client, db_session):
    """Test 3: Ambulance status patch updates status correctly."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    patch_resp = client.patch(
        f"/api/ambulances/{ambulance.id}/status",
        json={"status": "EN_ROUTE"}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "EN_ROUTE"

def test_4_ambulance_arrival(client, db_session):
    """Test 4: Marking ambulance ARRIVED updates emergency status and creates PENDING handoff."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    # Setup accepted request & assigned ambulance
    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    req_id = req_resp.json()["id"]
    client.post(f"/api/allocation-requests/{req_id}/accept")
    client.post(f"/api/emergencies/{emergency.id}/assign-ambulance", json={"ambulance_id": ambulance.id})

    # Mark arrived
    arrive_resp = client.patch(f"/api/ambulances/{ambulance.id}/status", json={"status": "ARRIVED"})
    assert arrive_resp.status_code == 200

    # Verify emergency status
    em_resp = client.get(f"/api/emergencies/{emergency.id}")
    assert em_resp.json()["status"] == "ARRIVED"

    # Verify handoff record created
    handoff_resp = client.get(f"/api/emergencies/{emergency.id}/handoff")
    assert handoff_resp.status_code == 200
    assert handoff_resp.json()["status"] == "PENDING"

def test_5_and_6_start_handoff_and_pre_arrival_prevention(client, db_session):
    """Test 5 & 6: Start handoff succeeds after arrival, fails before arrival."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    req_id = req_resp.json()["id"]
    client.post(f"/api/allocation-requests/{req_id}/accept")

    # Test 6: Attempt start handoff BEFORE arrival (should fail)
    early_start = client.post(f"/api/emergencies/{emergency.id}/handoff/start")
    assert early_start.status_code in [400, 409]

    # Assign ambulance & mark arrived
    client.post(f"/api/emergencies/{emergency.id}/assign-ambulance", json={"ambulance_id": ambulance.id})
    client.patch(f"/api/ambulances/{ambulance.id}/status", json={"status": "ARRIVED"})

    # Test 5: Start handoff after arrival (should succeed)
    start_resp = client.post(f"/api/emergencies/{emergency.id}/handoff/start")
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "IN_PROGRESS"

def test_7_8_9_10_complete_handoff_workflow(client, db_session):
    """
    Test 7, 8, 9, 10:
    - Complete handoff succeeds when IN_PROGRESS.
    - Cannot complete handoff twice.
    - Emergency status reaches HANDOFF_COMPLETED.
    - Ambulance status reverts to AVAILABLE.
    """
    hospital, emergency, ambulance = create_sample_setup(db_session)

    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    req_id = req_resp.json()["id"]
    client.post(f"/api/allocation-requests/{req_id}/accept")
    client.post(f"/api/emergencies/{emergency.id}/assign-ambulance", json={"ambulance_id": ambulance.id})
    client.patch(f"/api/ambulances/{ambulance.id}/status", json={"status": "ARRIVED"})
    client.post(f"/api/emergencies/{emergency.id}/handoff/start")

    # Test 7: Complete handoff
    complete_resp = client.post(
        f"/api/emergencies/{emergency.id}/handoff/complete",
        json={"received_by": "Dr. House", "notes": "Patient admitted to ICU"}
    )
    assert complete_resp.status_code == 200
    assert complete_resp.json()["status"] == "COMPLETED"
    assert complete_resp.json()["received_by"] == "Dr. House"

    # Test 8: Cannot complete handoff twice
    repeat_complete = client.post(
        f"/api/emergencies/{emergency.id}/handoff/complete",
        json={"received_by": "Dr. Wilson", "notes": "Duplicate check"}
    )
    assert repeat_complete.status_code in [400, 409]

    # Test 9: Ambulance becomes AVAILABLE
    amb_resp = client.get(f"/api/ambulances/{ambulance.id}")
    assert amb_resp.json()["status"] == "AVAILABLE"

    # Test 10: Emergency reaches HANDOFF_COMPLETED
    em_resp = client.get(f"/api/emergencies/{emergency.id}")
    assert em_resp.json()["status"] == "HANDOFF_COMPLETED"

def test_11_and_12_websocket_events(client, db_session):
    """Test 11 & 12: WebSocket receives AMBULANCE_STATUS_UPDATED and HANDOFF_STARTED/COMPLETED events."""
    hospital, emergency, ambulance = create_sample_setup(db_session)

    req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
    req_id = req_resp.json()["id"]
    client.post(f"/api/allocation-requests/{req_id}/accept")

    with client.websocket_connect("/ws") as websocket:
        # Handshake
        websocket.receive_json()

        # 1. Assign Ambulance -> WS event
        client.post(f"/api/emergencies/{emergency.id}/assign-ambulance", json={"ambulance_id": ambulance.id})
        events = [websocket.receive_json()["event"] for _ in range(3)]
        assert "AMBULANCE_ASSIGNED" in events
        assert "AMBULANCE_STATUS_UPDATED" in events

        # 2. Mark Arrived -> WS events
        client.patch(f"/api/ambulances/{ambulance.id}/status", json={"status": "ARRIVED"})
        arrive_events = [websocket.receive_json()["event"] for _ in range(3)]
        assert "AMBULANCE_ARRIVED" in arrive_events

        # 3. Start Handoff -> WS event
        client.post(f"/api/emergencies/{emergency.id}/handoff/start")
        start_event = websocket.receive_json()
        assert start_event["event"] == "HANDOFF_STARTED"

        # 4. Complete Handoff -> WS events
        client.post(
            f"/api/emergencies/{emergency.id}/handoff/complete",
            json={"received_by": "Dr. Sarah Conner", "notes": "Handoff complete"}
        )
        complete_events = [websocket.receive_json()["event"] for _ in range(3)]
        assert "HANDOFF_COMPLETED" in complete_events
