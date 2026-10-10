from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Test creating an emergency
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

print("Testing emergency creation...")
response = client.post("/api/emergencies", json=payload)
print(f"Status code: {response.status_code}")
print(f"Response: {response.json()}")