import sys
import os
from decimal import Decimal

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

from app.db.database import SessionLocal, engine, Base
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from app.models.emergency import EmergencyCase, EmergencyRequirement, EmergencySeverity, EmergencyStatus
from app.models.ambulance import Ambulance, AmbulanceStatus

SAMPLE_AMBULANCES = [
    {"vehicle_number": "MH12AB1234", "status": AmbulanceStatus.AVAILABLE, "current_latitude": 37.7749, "current_longitude": -122.4194},
    {"vehicle_number": "MH12CD5678", "status": AmbulanceStatus.AVAILABLE, "current_latitude": 37.7833, "current_longitude": -122.4167},
    {"vehicle_number": "MH14EF9012", "status": AmbulanceStatus.AVAILABLE, "current_latitude": 37.7650, "current_longitude": -122.4250},
]

SAMPLE_HOSPITALS = [
    {
        "name": "CityCare Hospital",
        "address": "123 Healthcare Ave, Central District",
        "latitude": Decimal("37.774900"),
        "longitude": Decimal("-122.419400"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 20, "available": 5, "reserved": 2},
            {"resource_type": ResourceType.VENTILATOR, "total": 10, "available": 3, "reserved": 1},
            {"resource_type": ResourceType.OXYGEN_BED, "total": 30, "available": 12, "reserved": 4},
            {"resource_type": ResourceType.GENERAL_BED, "total": 50, "available": 20, "reserved": 5},
        ]
    },
    {
        "name": "Metro General Hospital",
        "address": "456 Metropolitan Blvd, Downtown",
        "latitude": Decimal("37.783300"),
        "longitude": Decimal("-122.416700"),
        "emergency_level": "Level 2",
        "trauma_center": False,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.GENERAL_BED, "total": 100, "available": 45, "reserved": 10},
            {"resource_type": ResourceType.OXYGEN_BED, "total": 40, "available": 18, "reserved": 3},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 8, "available": 2, "reserved": 1},
        ]
    },
    {
        "name": "Apex Trauma Center",
        "address": "789 Emergency Plaza, North Wing",
        "latitude": Decimal("37.765000"),
        "longitude": Decimal("-122.425000"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.TRAUMA_BED, "total": 15, "available": 4, "reserved": 2},
            {"resource_type": ResourceType.ICU_BED, "total": 25, "available": 6, "reserved": 3},
            {"resource_type": ResourceType.VENTILATOR, "total": 15, "available": 5, "reserved": 2},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 12, "available": 4, "reserved": 2},
        ]
    }
]

SAMPLE_EMERGENCIES = [
    {
        "case_number": "ER-000001",
        "severity": EmergencySeverity.CRITICAL,
        "patient_age": 34,
        "description": "CRITICAL multi-vehicle collision on Highway 101 with severe trauma",
        "pickup_latitude": Decimal("37.775000"),
        "pickup_longitude": Decimal("-122.418000"),
        "status": EmergencyStatus.CREATED,
        "requirements": [
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "required": True},
            {"resource_type": ResourceType.VENTILATOR, "quantity": 1, "required": True},
            {"resource_type": ResourceType.TRAUMA_BED, "quantity": 1, "required": True},
        ]
    }
]

def seed_database():
    print("Seeding sample hospital, emergency, and ambulance database...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed Ambulances
        created_ambulances = 0
        for amb in SAMPLE_AMBULANCES:
            existing_amb = db.query(Ambulance).filter(Ambulance.vehicle_number == amb["vehicle_number"]).first()
            if existing_amb:
                print(f"Skipping existing ambulance: {amb['vehicle_number']}")
                continue
            ambulance = Ambulance(**amb)
            db.add(ambulance)
            created_ambulances += 1
            print(f"Created ambulance: {ambulance.vehicle_number}")

        # Seed Hospitals
        created_hospitals = 0
        for data in SAMPLE_HOSPITALS:
            existing = db.query(Hospital).filter(Hospital.name == data["name"]).first()
            if existing:
                print(f"Skipping existing hospital: {data['name']}")
                continue

            resources_data = data.pop("resources")
            hospital = Hospital(**data)
            db.add(hospital)
            db.flush()

            for res in resources_data:
                resource = HospitalResource(hospital_id=hospital.id, **res)
                db.add(resource)

            created_hospitals += 1
            print(f"Created hospital: {hospital.name} with {len(resources_data)} resource types")

        # Seed Emergencies
        created_emergencies = 0
        for e_data in SAMPLE_EMERGENCIES:
            existing_e = db.query(EmergencyCase).filter(EmergencyCase.case_number == e_data["case_number"]).first()
            if existing_e:
                print(f"Skipping existing emergency case: {e_data['case_number']}")
                continue

            reqs_data = e_data.pop("requirements")
            emergency = EmergencyCase(**e_data)
            db.add(emergency)
            db.flush()

            for req in reqs_data:
                requirement = EmergencyRequirement(emergency_case_id=emergency.id, **req)
                db.add(requirement)

            created_emergencies += 1
            print(f"Created emergency case: {emergency.case_number} with {len(reqs_data)} requirements")

        db.commit()
        print(f"Successfully seeded {created_ambulances} ambulances, {created_hospitals} hospitals, and {created_emergencies} emergency cases.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
