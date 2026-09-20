import sys
import os
from decimal import Decimal

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

from app.db.database import SessionLocal, engine, Base
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType

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

def seed_database():
    print("Seeding sample hospital database...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created_count = 0
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
                resource = HospitalResource(
                    hospital_id=hospital.id,
                    **res
                )
                db.add(resource)

            created_count += 1
            print(f"Created hospital: {hospital.name} with {len(resources_data)} resource types")

        db.commit()
        print(f"Successfully seeded {created_count} hospitals.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
