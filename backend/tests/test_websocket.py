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
from app.models.allocation_request import AllocationRequest, AllocationRequestStatus

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

def create_sample_hospital_and_emergency(db: Session):
    hospital = Hospital(
        name="Test General Hospital",
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
        reserved=5,
        last_updated=datetime.now(timezone.utc)
    )
    db.add(resource)

    emergency = EmergencyCase(
        case_number=f"ER-WS-{uuid.uuid4().hex[:6]}",
        severity=EmergencySeverity.CRITICAL,
        patient_age=40,
        description="WS Test Emergency Case",
        pickup_latitude=37.7750,
        pickup_longitude=-122.4180,
        status=EmergencyStatus.CREATED
    )
    db.add(emergency)
    db.flush()

    requirement = EmergencyRequirement(
        emergency_case_id=emergency.id,
        resource_type=ResourceType.ICU_BED,
        quantity=2,
        required=True
    )
    db.add(requirement)

    db.commit()
    db.refresh(hospital)
    db.refresh(emergency)
    return hospital, emergency, resource

def test_1_websocket_connection(client):
    """Test 1: Connecting to /ws receives initial CONNECTED event."""
    with client.websocket_connect("/ws") as websocket:
        data = websocket.receive_json()
        assert data["event"] == "CONNECTED"

def test_2_websocket_disconnect(client):
    """Test 2: Disconnecting client cleans up gracefully."""
    with client.websocket_connect("/ws") as websocket:
        data = websocket.receive_json()
        assert data["event"] == "CONNECTED"
    # Exit context causes disconnect

def test_3_resource_updated_event(client, db_session):
    """Test 3: Editing hospital resource availability broadcasts RESOURCE_UPDATED event."""
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    with client.websocket_connect("/ws") as websocket:
        # Read handshake
        websocket.receive_json()

        # Update resource via API
        response = client.post(
            f"/api/hospitals/{hospital.id}/resources",
            json={
                "resource_type": "ICU_BED",
                "total": 10,
                "available": 8,
                "reserved": 2
            }
        )
        assert response.status_code == 201

        # Receive WS event
        ws_event = websocket.receive_json()
        assert ws_event["event"] == "RESOURCE_UPDATED"
        assert ws_event["data"]["hospital_id"] == hospital.id
        assert ws_event["data"]["available"] == 8
        assert ws_event["data"]["reserved"] == 2

def test_4_allocation_request_created_event(client, db_session):
    """Test 4: Creating allocation request broadcasts ALLOCATION_REQUEST_CREATED event."""
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        response = client.post(
            f"/api/emergencies/{emergency.id}/requests",
            json={"hospital_id": hospital.id}
        )
        assert response.status_code == 201

        ws_event = websocket.receive_json()
        assert ws_event["event"] == "ALLOCATION_REQUEST_CREATED"
        assert ws_event["data"]["emergency_id"] == emergency.id
        assert ws_event["data"]["hospital_id"] == hospital.id
        assert ws_event["data"]["status"] == "PENDING"

def test_5_allocation_request_accepted_and_reservation_events(client, db_session):
    """Test 5: Accepting allocation request broadcasts ACCEPTED, RESERVATION, and RESOURCE events."""
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    # Create request
    req_resp = client.post(
        f"/api/emergencies/{emergency.id}/requests",
        json={"hospital_id": hospital.id}
    )
    req_id = req_resp.json()["id"]

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        # Accept request
        accept_resp = client.post(f"/api/allocation-requests/{req_id}/accept")
        assert accept_resp.status_code == 200

        received_events = []
        for _ in range(4):
            event = websocket.receive_json()
            received_events.append(event["event"])

        assert "ALLOCATION_REQUEST_ACCEPTED" in received_events
        assert "RESERVATION_CREATED" in received_events
        assert "EMERGENCY_STATUS_UPDATED" in received_events
        assert "RESOURCE_UPDATED" in received_events

def test_6_allocation_request_rejected_event(client, db_session):
    """Test 6: Rejecting allocation request broadcasts ALLOCATION_REQUEST_REJECTED event."""
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    req_resp = client.post(
        f"/api/emergencies/{emergency.id}/requests",
        json={"hospital_id": hospital.id}
    )
    req_id = req_resp.json()["id"]

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        reject_resp = client.post(
            f"/api/allocation-requests/{req_id}/reject",
            json={"reason": "No ICU staff available"}
        )
        assert reject_resp.status_code == 200

        ws_event = websocket.receive_json()
        assert ws_event["event"] == "ALLOCATION_REQUEST_REJECTED"
        assert ws_event["data"]["request_id"] == req_id
        assert ws_event["data"]["rejection_reason"] == "No ICU staff available"

def test_7_emergency_status_updated_event(client, db_session):
    """Test 7: Updating emergency case status broadcasts EMERGENCY_STATUS_UPDATED event."""
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        response = client.patch(
            f"/api/emergencies/{emergency.id}/status",
            json={"status": "EN_ROUTE"}
        )
        assert response.status_code == 200

        ws_event = websocket.receive_json()
        assert ws_event["event"] == "EMERGENCY_STATUS_UPDATED"
        assert ws_event["data"]["emergency_id"] == emergency.id
        assert ws_event["data"]["status"] == "EN_ROUTE"

def test_8_and_9_failed_reservation_no_broadcast(client, db_session):
    """
    Test 8 & 9: Verify resource events are ONLY sent after successful commit.
    A failed reservation (409 Conflict) MUST NOT broadcast a false successful resource update or request acceptance.
    """
    hospital, emergency, resource = create_sample_hospital_and_emergency(db_session)

    # 1. Create request while resources are available
    req_resp = client.post(
        f"/api/emergencies/{emergency.id}/requests",
        json={"hospital_id": hospital.id}
    )
    assert req_resp.status_code == 201
    req_id = req_resp.json()["id"]

    # 2. Reduce available count to 1 (needed is 2) via resource update
    client.post(
        f"/api/hospitals/{hospital.id}/resources",
        json={
            "resource_type": "ICU_BED",
            "total": 10,
            "available": 1,
            "reserved": 9
        }
    )

    with client.websocket_connect("/ws") as websocket:
        websocket.receive_json()

        # 3. Attempt to accept request (should fail with 409 Conflict)
        accept_resp = client.post(f"/api/allocation-requests/{req_id}/accept")
        assert accept_resp.status_code == 409
        assert "RESOURCE_UNAVAILABLE" in accept_resp.json()["detail"]

        # 4. Perform explicit resource update to verify WS stream only receives post-commit events
        client.post(
            f"/api/hospitals/{hospital.id}/resources",
            json={
                "resource_type": "ICU_BED",
                "total": 10,
                "available": 8,
                "reserved": 2
            }
        )
        ws_event = websocket.receive_json()
        assert ws_event["event"] == "RESOURCE_UPDATED"
        assert ws_event["data"]["available"] == 8

