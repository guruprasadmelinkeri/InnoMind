import sys
import os
from decimal import Decimal
from datetime import datetime, timezone, timedelta

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

from app.db.database import SessionLocal, engine, Base
from app.models import (
    Hospital,
    HospitalResource,
    ResourceType,
    EmergencyCase,
    EmergencyRequirement,
    EmergencySeverity,
    EmergencyStatus,
    Ambulance,
    AmbulanceStatus,
    AllocationRequest,
    Reservation,
    Handoff,
)

# -----------------------------------------------------------------------------
# REAL PUNE AMBULANCES
# -----------------------------------------------------------------------------
SAMPLE_AMBULANCES = [
    {
        "vehicle_number": "MH12-PA-1001",
        "status": AmbulanceStatus.AVAILABLE,
        "current_latitude": 18.5018,
        "current_longitude": 73.8580,  # Swargate Chowk
    },
    {
        "vehicle_number": "MH12-RN-2002",
        "status": AmbulanceStatus.AVAILABLE,
        "current_latitude": 18.5165,
        "current_longitude": 73.8405,  # Deccan Gymkhana
    },
    {
        "vehicle_number": "MH14-AZ-3003",
        "status": AmbulanceStatus.AVAILABLE,
        "current_latitude": 18.5120,
        "current_longitude": 73.9250,  # Magarpatta / Hadapsar
    },
    {
        "vehicle_number": "MH12-EM-4004",
        "status": AmbulanceStatus.AVAILABLE,
        "current_latitude": 18.5314,
        "current_longitude": 73.8510,  # Shivajinagar
    },
]

# -----------------------------------------------------------------------------
# REAL PUNE HOSPITALS (Accurate Geographic Coordinates & Realistic Resources)
# -----------------------------------------------------------------------------
SAMPLE_HOSPITALS = [
    {
        "name": "Sahyadri Super Speciality Hospital, Deccan",
        "address": "Plot No. 30 C, Erandwane, Karve Rd, Deccan Gymkhana, Pune, Maharashtra 411004",
        "latitude": Decimal("18.514700"),
        "longitude": Decimal("73.837800"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 24, "available": 6, "reserved": 2},
            {"resource_type": ResourceType.VENTILATOR, "total": 14, "available": 4, "reserved": 1},
            {"resource_type": ResourceType.TRAUMA_BED, "total": 12, "available": 3, "reserved": 1},
            {"resource_type": ResourceType.GENERAL_BED, "total": 60, "available": 22, "reserved": 5},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 6, "available": 2, "reserved": 1},
        ],
    },
    {
        "name": "Jehangir Hospital",
        "address": "32, Sassoon Rd, Central Railway Colony, Pune, Maharashtra 411001",
        "latitude": Decimal("18.529800"),
        "longitude": Decimal("73.876500"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 30, "available": 8, "reserved": 3},
            {"resource_type": ResourceType.VENTILATOR, "total": 16, "available": 5, "reserved": 2},
            {"resource_type": ResourceType.GENERAL_BED, "total": 80, "available": 35, "reserved": 8},
            {"resource_type": ResourceType.OXYGEN_BED, "total": 40, "available": 15, "reserved": 4},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 8, "available": 3, "reserved": 1},
        ],
    },
    {
        "name": "Sancheti Hospital",
        "address": "16, Shivajinagar, Narveer Tanaji Wadi, Pune, Maharashtra 411005",
        "latitude": Decimal("18.530800"),
        "longitude": Decimal("73.852700"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.TRAUMA_BED, "total": 20, "available": 7, "reserved": 2},
            {"resource_type": ResourceType.ICU_BED, "total": 18, "available": 4, "reserved": 1},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 10, "available": 4, "reserved": 2},
            {"resource_type": ResourceType.GENERAL_BED, "total": 70, "available": 28, "reserved": 6},
            {"resource_type": ResourceType.VENTILATOR, "total": 8, "available": 2, "reserved": 1},
        ],
    },
    {
        "name": "Noble Hospitals & Research Centre",
        "address": "153, Magarpatta City Rd, Hadapsar, Pune, Maharashtra 411028",
        "latitude": Decimal("18.503400"),
        "longitude": Decimal("73.928800"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 22, "available": 5, "reserved": 2},
            {"resource_type": ResourceType.GENERAL_BED, "total": 90, "available": 40, "reserved": 10},
            {"resource_type": ResourceType.OXYGEN_BED, "total": 35, "available": 14, "reserved": 3},
            {"resource_type": ResourceType.VENTILATOR, "total": 12, "available": 3, "reserved": 1},
            {"resource_type": ResourceType.TRAUMA_BED, "total": 10, "available": 2, "reserved": 1},
        ],
    },
    {
        "name": "Manipal Hospital, Kharadi",
        "address": "Survey No. 22/2A, Mundhwa - Kharadi Rd, Kharadi, Pune, Maharashtra 411014",
        "latitude": Decimal("18.552900"),
        "longitude": Decimal("73.939200"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 25, "available": 7, "reserved": 2},
            {"resource_type": ResourceType.VENTILATOR, "total": 15, "available": 6, "reserved": 1},
            {"resource_type": ResourceType.GENERAL_BED, "total": 100, "available": 48, "reserved": 12},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 8, "available": 3, "reserved": 1},
            {"resource_type": ResourceType.TRAUMA_BED, "total": 12, "available": 4, "reserved": 1},
        ],
    },
    {
        "name": "Ranka Hospital",
        "address": "157/5, SS Thorat Marg, Mukund Nagar, Swargate, Pune, Maharashtra 411037",
        "latitude": Decimal("18.497500"),
        "longitude": Decimal("73.861700"),
        "emergency_level": "Level 2",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.TRAUMA_BED, "total": 14, "available": 4, "reserved": 1},
            {"resource_type": ResourceType.ICU_BED, "total": 15, "available": 3, "reserved": 1},
            {"resource_type": ResourceType.GENERAL_BED, "total": 45, "available": 18, "reserved": 4},
            {"resource_type": ResourceType.VENTILATOR, "total": 6, "available": 2, "reserved": 1},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 4, "available": 1, "reserved": 1},
        ],
    },
    {
        "name": "Ruby Hall Clinic",
        "address": "40, Sassoon Rd, Sangamvadi, Pune, Maharashtra 411001",
        "latitude": Decimal("18.532300"),
        "longitude": Decimal("73.877000"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 35, "available": 10, "reserved": 4},
            {"resource_type": ResourceType.VENTILATOR, "total": 20, "available": 7, "reserved": 2},
            {"resource_type": ResourceType.GENERAL_BED, "total": 120, "available": 50, "reserved": 15},
            {"resource_type": ResourceType.TRAUMA_BED, "total": 16, "available": 5, "reserved": 2},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 12, "available": 5, "reserved": 2},
        ],
    },
    {
        "name": "Deenanath Mangeshkar Hospital",
        "address": "Near Mhatre Bridge, Erandwane, Pune, Maharashtra 411004",
        "latitude": Decimal("18.499600"),
        "longitude": Decimal("73.829500"),
        "emergency_level": "Level 1",
        "trauma_center": True,
        "status": "Active",
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 32, "available": 9, "reserved": 3},
            {"resource_type": ResourceType.VENTILATOR, "total": 18, "available": 5, "reserved": 1},
            {"resource_type": ResourceType.GENERAL_BED, "total": 110, "available": 42, "reserved": 10},
            {"resource_type": ResourceType.OXYGEN_BED, "total": 45, "available": 18, "reserved": 5},
            {"resource_type": ResourceType.OPERATING_ROOM, "total": 10, "available": 4, "reserved": 1},
        ],
    },
    {
        "name": "KEM Hospital, Rasta Peth",
        "address": "Sardar Moodliar Rd, Rasta Peth, Pune, Maharashtra 411011",
        "latitude": Decimal("18.520400"),
        "longitude": Decimal("73.868300"),
        "emergency_level": "Level 2",
        "trauma_center": False,
        "status": "Offline",  # Sample offline hospital to test offline visualization
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "total": 15, "available": 0, "reserved": 5},
            {"resource_type": ResourceType.GENERAL_BED, "total": 60, "available": 0, "reserved": 15},
            {"resource_type": ResourceType.VENTILATOR, "total": 5, "available": 0, "reserved": 2},
        ],
    },
]

# -----------------------------------------------------------------------------
# REAL PUNE SAMPLE EMERGENCIES
# -----------------------------------------------------------------------------
SAMPLE_EMERGENCIES = [
    {
        "case_number": "ER-000001",
        "severity": EmergencySeverity.CRITICAL,
        "patient_age": 34,
        "description": "CRITICAL road traffic accident near FC Road, Deccan Gymkhana with suspected thoracic trauma and severe respiratory distress.",
        "pickup_latitude": Decimal("18.520400"),
        "pickup_longitude": Decimal("73.841000"),
        "status": EmergencyStatus.CREATED,
        "requirements": [
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "required": True},
            {"resource_type": ResourceType.VENTILATOR, "quantity": 1, "required": True},
            {"resource_type": ResourceType.TRAUMA_BED, "quantity": 1, "required": True},
        ],
    },
    {
        "case_number": "ER-000002",
        "severity": EmergencySeverity.HIGH,
        "patient_age": 62,
        "description": "Acute cardiac emergency and respiratory failure reported near Swargate Bus Stand.",
        "pickup_latitude": Decimal("18.501800"),
        "pickup_longitude": Decimal("73.858000"),
        "status": EmergencyStatus.CREATED,
        "requirements": [
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "required": True},
            {"resource_type": ResourceType.VENTILATOR, "quantity": 1, "required": True},
        ],
    },
    {
        "case_number": "ER-000003",
        "severity": EmergencySeverity.MODERATE,
        "patient_age": 28,
        "description": "Industrial burn and orthopedic trauma near Magarpatta City, Hadapsar.",
        "pickup_latitude": Decimal("18.508900"),
        "pickup_longitude": Decimal("73.926000"),
        "status": EmergencyStatus.CREATED,
        "requirements": [
            {"resource_type": ResourceType.GENERAL_BED, "quantity": 2, "required": True},
            {"resource_type": ResourceType.TRAUMA_BED, "quantity": 1, "required": True},
        ],
    },
]

def seed_database():
    print("Resetting and seeding real Pune hospital, emergency, and ambulance database...")
    Base.metadata.drop_all(bind=engine)
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
            print(f"Created ambulance: {ambulance.vehicle_number} at ({ambulance.current_latitude}, {ambulance.current_longitude})")

        # Seed Hospitals
        created_hospitals = 0
        now = datetime.now(timezone.utc)
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
                # Add realistic simulated last_updated
                resource = HospitalResource(
                    hospital_id=hospital.id,
                    last_updated=now - timedelta(seconds=15),
                    **res
                )
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
        print(f"Successfully seeded {created_ambulances} ambulances, {created_hospitals} Pune hospitals, and {created_emergencies} emergency cases.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
