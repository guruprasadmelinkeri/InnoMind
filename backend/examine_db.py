#!/usr/bin/env python3
"""Script to examine the current database state."""

from app.db.database import SessionLocal, engine
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from sqlalchemy import text

def examine_database():
    db = SessionLocal()
    try:
        # Check current alembic version
        result = db.execute(text("SELECT version_num FROM alembic_version"))
        version = result.fetchone()
        print(f"Current Alembic version: {version[0] if version else 'None'}")

        # Count hospitals
        hospital_count = db.query(Hospital).count()
        print(f"Total hospitals: {hospital_count}")

        # List all hospitals
        hospitals = db.query(Hospital).all()
        print("\nExisting hospitals:")
        for i, hospital in enumerate(hospitals, 1):
            print(f"{i}. ID: {hospital.id}")
            print(f"   Name: {hospital.name}")
            print(f"   Address: {hospital.address}")
            print(f"   Coordinates: ({hospital.latitude}, {hospital.longitude})")
            print(f"   Emergency Level: {hospital.emergency_level}")
            print(f"   Trauma Center: {hospital.trauma_center}")
            print(f"   Automatic Resource Allocation: {hospital.automatic_resource_allocation}")
            print(f"   Status: {hospital.status}")

            # Get resources for this hospital
            resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).all()
            if resources:
                print(f"   Resources:")
                for resource in resources:
                    print(f"     - {resource.resource_type.value}: Total={resource.total}, Available={resource.available}, Reserved={resource.reserved}")
            else:
                print("   Resources: None")
            print()

        # Check for any existing emergencies, reservations, etc. that might depend on hospitals
        from app.models.emergency import EmergencyCase
        from app.models.reservation import Reservation
        from app.models.allocation_request import AllocationRequest

        emergency_count = db.query(EmergencyCase).count()
        reservation_count = db.query(Reservation).count()
        allocation_request_count = db.query(AllocationRequest).count()

        print(f"Existing emergencies: {emergency_count}")
        print(f"Existing reservations: {reservation_count}")
        print(f"Existing allocation requests: {allocation_request_count}")

    finally:
        db.close()

if __name__ == "__main__":
    examine_database()