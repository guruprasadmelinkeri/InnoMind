#!/usr/bin/env python3
"""Script to check hospital dependencies in the database."""

from app.db.database import SessionLocal
from app.models.hospital import Hospital
from app.models.emergency import EmergencyCase
from app.models.reservation import Reservation
from app.models.allocation_request import AllocationRequest

def check_dependencies():
    db = SessionLocal()
    try:
        # Get all hospitals
        hospitals = db.query(Hospital).all()
        print(f"Checking dependencies for {len(hospitals)} hospitals:")

        for hospital in hospitals:
            print(f"\nHospital ID: {hospital.id}, Name: '{hospital.name}'")

            # Check allocation requests that reference this hospital
            allocation_requests = db.query(AllocationRequest).filter(AllocationRequest.hospital_id == hospital.id).all()
            print(f"  Allocation requests referencing this hospital: {len(allocation_requests)}")

            # Check reservations that reference this hospital directly
            reservations = db.query(Reservation).filter(Reservation.hospital_id == hospital.id).all()
            print(f"  Reservations referencing this hospital: {len(reservations)}")

            # Check if any emergencies have allocation requests pointing to this hospital
            emergency_count = 0
            example_emergencies = []
            for alloc_req in allocation_requests:
                # Find emergencies that led to this allocation request
                # AllocationRequest has emergency_case_id
                emergency = db.query(EmergencyCase).filter(EmergencyCase.id == alloc_req.emergency_case_id).first()
                if emergency:
                    emergency_count += 1
                    if len(example_emergencies) < 3:  # Keep up to 3 examples
                        example_emergencies.append(emergency)
            print(f"  Emergencies with allocation requests to this hospital: {emergency_count}")

            # Show some examples if there are dependencies
            if allocation_requests:
                print(f"    Example allocation requests: {[req.id for req in allocation_requests[:3]]}")
            if reservations:
                print(f"    Example reservations: {[req.id for req in reservations[:3]]}")
            if example_emergencies:
                print(f"    Example emergencies: ID {example_emergencies[0].id}, Case #{example_emergencies[0].case_number}" +
                      (f" (and {len(example_emergencies)-1} more)" if len(example_emergencies) > 1 else ""))

        # Summary
        print("\n" + "="*50)
        print("SUMMARY:")
        total_alloc_requests = db.query(AllocationRequest).count()
        total_reservations = db.query(Reservation).count()
        total_emergencies = db.query(EmergencyCase).count()
        print(f"Total allocation requests in DB: {total_alloc_requests}")
        print(f"Total reservations in DB: {total_reservations}")
        print(f"Total emergencies in DB: {total_emergencies}")

    finally:
        db.close()

if __name__ == "__main__":
    check_dependencies()