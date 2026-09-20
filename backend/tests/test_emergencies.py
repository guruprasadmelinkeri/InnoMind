import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_emergency_and_requirements():
    """Test creating an emergency case with valid resource requirements."""
    payload = {
        "severity": "CRITICAL",
        "patient_age": 45,
        "description": "Severe cardiac distress near central park",
        "pickup_latitude": 37.774900,
        "pickup_longitude": -122.419400,
        "requirements": [
            {"resource_type": "ICU_BED", "quantity": 1, "required": True},
            {"resource_type": "VENTILATOR", "quantity": 1, "required": True}
        ]
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["case_number"].startswith("ER-")
    assert data["severity"] == "CRITICAL"
    assert data["status"] == "CREATED"
    assert len(data["requirements"]) == 2
    assert data["requirements"][0]["resource_type"] == "ICU_BED"
    assert data["requirements"][0]["quantity"] == 1

def test_retrieve_emergency():
    """Test retrieving an emergency case by ID and listing all cases."""
    # List all cases
    response = client.get("/api/emergencies")
    assert response.status_code == 200
    cases = response.json()
    assert len(cases) > 0
    target_id = cases[0]["id"]

    # Get single case by ID
    response_single = client.get(f"/api/emergencies/{target_id}")
    assert response_single.status_code == 200
    single_data = response_single.json()
    assert single_data["id"] == target_id
    assert "requirements" in single_data

def test_update_emergency_status():
    """Test updating the status of an emergency case."""
    payload = {
        "severity": "HIGH",
        "pickup_latitude": 37.780000,
        "pickup_longitude": -122.410000,
        "requirements": [{"resource_type": "GENERAL_BED", "quantity": 2, "required": True}]
    }
    res_create = client.post("/api/emergencies", json=payload)
    case_id = res_create.json()["id"]

    # Update status to SEARCHING
    res_update = client.patch(f"/api/emergencies/{case_id}/status", json={"status": "SEARCHING"})
    assert res_update.status_code == 200
    assert res_update.json()["status"] == "SEARCHING"

    # Update status to EN_ROUTE
    res_update_enroute = client.patch(f"/api/emergencies/{case_id}/status", json={"status": "EN_ROUTE"})
    assert res_update_enroute.status_code == 200
    assert res_update_enroute.json()["status"] == "EN_ROUTE"

def test_invalid_coordinates():
    """Test that invalid latitude or longitude returns validation error (422)."""
    # Invalid latitude > 90
    payload_bad_lat = {
        "severity": "MODERATE",
        "pickup_latitude": 105.000000,
        "pickup_longitude": -122.410000,
        "requirements": [{"resource_type": "OXYGEN_BED", "quantity": 1}]
    }
    res_lat = client.post("/api/emergencies", json=payload_bad_lat)
    assert res_lat.status_code == 422

    # Invalid longitude < -180
    payload_bad_lng = {
        "severity": "MODERATE",
        "pickup_latitude": 37.780000,
        "pickup_longitude": -210.000000,
        "requirements": [{"resource_type": "OXYGEN_BED", "quantity": 1}]
    }
    res_lng = client.post("/api/emergencies", json=payload_bad_lng)
    assert res_lng.status_code == 422

def test_invalid_resource_quantity():
    """Test that resource quantity <= 0 returns validation error (422)."""
    payload_zero_qty = {
        "severity": "HIGH",
        "pickup_latitude": 37.780000,
        "pickup_longitude": -122.410000,
        "requirements": [{"resource_type": "VENTILATOR", "quantity": 0}]
    }
    res = client.post("/api/emergencies", json=payload_zero_qty)
    assert res.status_code in [400, 422]

def test_empty_requirements():
    """Test that creating an emergency without requirements returns validation error (422)."""
    payload_empty = {
        "severity": "LOW",
        "pickup_latitude": 37.780000,
        "pickup_longitude": -122.410000,
        "requirements": []
    }
    res = client.post("/api/emergencies", json=payload_empty)
    assert res.status_code in [400, 422]

def test_duplicate_case_number():
    """Test that submitting a duplicate custom case number returns error (400)."""
    custom_case_number = f"ER-CUSTOM-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "case_number": custom_case_number,
        "severity": "CRITICAL",
        "pickup_latitude": 37.780000,
        "pickup_longitude": -122.410000,
        "requirements": [{"resource_type": "TRAUMA_BED", "quantity": 1}]
    }
    res1 = client.post("/api/emergencies", json=payload)
    assert res1.status_code == 201

    # Attempt second post with identical custom case_number
    res2 = client.post("/api/emergencies", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]
