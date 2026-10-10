import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import get_db, Base, engine
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencyStatus, EmergencySeverity
from app.models.ambulance import Ambulance, AmbulanceStatus

client = TestClient(app)

def create_sample_setup():
    """Helper to create a hospital, emergency case with requirements, and an ambulance."""
    # Clear database
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = next(get_db())
    try:
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

        return hospital, emergency, ambulance, db
    finally:
        db.close()

# Replicate the test steps
hospital, emergency, ambulance, db = create_sample_setup()

print(f"Created hospital: {hospital.id}")
print(f"Created emergency: {emergency.id}")
print(f"Created ambulance: {ambulance.id}")

# 1. Create and accept allocation request
print("\n1. Creating allocation request...")
req_resp = client.post(f"/api/emergencies/{emergency.id}/requests", json={"hospital_id": hospital.id})
print(f"   Create request status: {req_resp.status_code}")
if req_resp.status_code != 201:
    print(f"   Error: {req_resp.json()}")
    exit(1)
req_id = req_resp.json()["id"]
print(f"   Request ID: {req_id}")

print("\n2. Accepting allocation request...")
accept_resp = client.post(f"/api/allocation-requests/{req_id}/accept")
print(f"   Accept request status: {accept_resp.status_code}")
if accept_resp.status_code != 200:
    print(f"   Error: {accept_resp.json()}")
    exit(1)
print(f"   Accept response: {accept_resp.json()}")

# Check emergency status after acceptance
print("\n3. Checking emergency status after acceptance...")
emergency_resp = client.get(f"/api/emergencies/{emergency.id}")
print(f"   Get emergency status: {emergency_resp.status_code}")
if emergency_resp.status_code == 200:
    emergency_data = emergency_resp.json()
    print(f"   Emergency status: {emergency_data['status']}")
    print(f"   Assigned ambulance ID: {emergency_data['assigned_ambulance_id']}")

# 2. Assign ambulance
print("\n4. Assigning ambulance...")
assign_resp = client.post(
    f"/api/emergencies/{emergency.id}/assign-ambulance",
    json={"ambulance_id": ambulance.id}
)
print(f"   Assign ambulance status: {assign_resp.status_code}")
if assign_resp.status_code != 200:
    print(f"   Error: {assign_resp.json()}")
else:
    print(f"   Success: {assign_resp.json()}")