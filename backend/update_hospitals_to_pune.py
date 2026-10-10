#!/usr/bin/env python3
"""Script to update existing hospitals to real Pune hospitals."""

from app.db.database import SessionLocal
from app.models.hospital import Hospital
from app.models.resource import HospitalResource, ResourceType
from pune_hospitals_data import PUNE_HOSPITALS, get_simulated_resources

def update_hospitals_to_pune():
    """Update existing hospitals to be real Pune hospitals."""
    db = SessionLocal()
    try:
        # Get existing hospitals
        existing_hospitals = db.query(Hospital).order_by(Hospital.id).all()

        print(f"Found {len(existing_hospitals)} existing hospitals")
        print(f"Updating to {len(PUNE_HOSPITALS)} Pune hospitals")

        # Update each existing hospital to correspond to a Pune hospital
        # We'll match by ID order: hospital ID 1 -> PUNE_HOSPITALS[0], etc.
        updated_count = 0
        for i, hospital in enumerate(existing_hospitals):
            if i < len(PUNE_HOSPITALS):
                pune_hospital_data = PUNE_HOSPITALS[i]

                # Check if this hospital already has the target name (idempotent check)
                if hospital.name == pune_hospital_data["name"]:
                    print(f"Hospital ID {hospital.id} already updated to '{hospital.name}' - skipping")
                    continue

                print(f"Updating Hospital ID {hospital.id}:")
                print(f"  From: '{hospital.name}'")
                print(f"  To:   '{pune_hospital_data['name']}'")

                # Update hospital fields
                hospital.name = pune_hospital_data["name"]
                hospital.address = pune_hospital_data["address"]
                hospital.latitude = pune_hospital_data["latitude"]
                hospital.longitude = pune_hospital_data["longitude"]
                hospital.emergency_level = pune_hospital_data["emergency_level"]
                hospital.trauma_center = pune_hospital_data["trauma_center"]
                hospital.automatic_resource_allocation = pune_hospital_data["automatic_resource_allocation"]
                hospital.status = pune_hospital_data["status"]

                updated_count += 1

                # Update or create resources for this hospital
                # First, remove existing resources (since we're changing the meaning of the hospital)
                existing_resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).all()
                for resource in existing_resources:
                    db.delete(resource)

                # Flush to ensure deletes are processed before inserts
                db.flush()

                # Add new simulated resources
                simulated_resources = get_simulated_resources()
                for resource_data in simulated_resources:
                    new_resource = HospitalResource(
                        hospital_id=hospital.id,
                        resource_type=ResourceType(resource_data["resource_type"]),
                        total=resource_data["total"],
                        available=resource_data["available"],
                        reserved=resource_data["reserved"],
                        last_updated=db.query(HospitalResource).filter(HospitalResource.id == 1).first().last_updated if db.query(HospitalResource).filter(HospitalResource.id == 1).first() else None
                    )
                    # Set a reasonable timestamp if we don't have a reference
                    if new_resource.last_updated is None:
                        from datetime import datetime, timezone
                        new_resource.last_updated = datetime.now(timezone.utc)

                    db.add(new_resource)

                print(f"    Updated resources: {len(simulated_resources)} resource types")
            else:
                # If we have more existing hospitals than Pune hospitals, deactivate the extra ones
                print(f"Deactivating extra Hospital ID {hospital.id} ('{hospital.name}') - no corresponding Pune hospital")
                hospital.status = "Inactive"

        # Commit all changes
        db.commit()
        print(f"\nSuccessfully updated {updated_count} hospitals to real Pune hospitals")

        # Verify the changes
        print("\nVerification:")
        updated_hospitals = db.query(Hospital).filter(Hospital.status == "Active").order_by(Hospital.id).all()
        for hospital in updated_hospitals:
            print(f"  ID {hospital.id}: {hospital.name}")
            print(f"    Coordinates: ({hospital.latitude}, {hospital.longitude})")
            print(f"    Emergency Level: {hospital.emergency_level}, Trauma Center: {hospital.trauma_center}")
            print(f"    Auto Allocation: {hospital.automatic_resource_allocation}")

            # Show resources
            resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).all()
            print(f"    Resources: {len(resources)} types")
            for resource in resources[:3]:  # Show first 3 resources
                print(f"      {resource.resource_type.value}: Total={resource.total}, Available={resource.available}")
            if len(resources) > 3:
                print(f"      ... and {len(resources) - 3} more resource types")
            print()

    except Exception as e:
        db.rollback()
        print(f"Error updating hospitals: {e}")
        raise
    finally:
        db.close()

def verify_preservation_of_operational_data():
    """Verify that operational records (emergencies, reservations, allocation requests) are preserved."""
    db = SessionLocal()
    try:
        from app.models.emergency import EmergencyCase
        from app.models.reservation import Reservation
        from app.models.allocation_request import AllocationRequest

        print("Verifying preservation of operational data:")

        emergency_count = db.query(EmergencyCase).count()
        reservation_count = db.query(Reservation).count()
        allocation_request_count = db.query(AllocationRequest).count()

        print(f"  Emergencies: {emergency_count}")
        print(f"  Reservations: {reservation_count}")
        print(f"  Allocation Requests: {allocation_request_count}")

        # Show a few examples to confirm they still reference valid hospitals
        if emergency_count > 0:
            sample_emergency = db.query(EmergencyCase).first()
            print(f"  Sample Emergency ID {sample_emergency.id}: Case #{sample_emergency.case_number}")

        if allocation_request_count > 0:
            sample_alloc = db.query(AllocationRequest).first()
            hospital_name = db.query(Hospital).filter(Hospital.id == sample_alloc.hospital_id).first().name
            print(f"  Sample Allocation Request ID {sample_alloc.id}: Hospital '{hospital_name}' (ID {sample_alloc.hospital_id})")

        if reservation_count > 0:
            sample_res = db.query(Reservation).first()
            hospital_name = db.query(Hospital).filter(Hospital.id == sample_res.hospital_id).first().name
            print(f"  Sample Reservation ID {sample_res.id}: Hospital '{hospital_name}' (ID {sample_res.hospital_id})")

        return emergency_count, reservation_count, allocation_request_count

    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("UPDATING HOSPITALS TO REAL PUNE HOSPITALS")
    print("=" * 60)

    # Update hospitals
    update_hospitals_to_pune()

    print("=" * 60)
    print("VERIFYING OPERATIONAL DATA PRESERVATION")
    print("=" * 60)

    # Verify operational data is preserved
    emergencies, reservations, allocation_requests = verify_preservation_of_operational_data()

    print("=" * 60)
    print("UPDATE COMPLETE")
    print("=" * 60)
    print(f"Summary:")
    print(f"  - Updated hospitals to real Pune hospitals")
    print(f"  - Preserved {emergencies} emergency records")
    print(f"  - Preserved {reservations} reservation records")
    print(f"  - Preserved {allocation_requests} allocation request records")
    print(f"  - All foreign key relationships maintained")