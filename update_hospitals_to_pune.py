#!/usr/bin/env python3
"""
Script to update hospital data with realistic Pune, Maharashtra, India coordinates
and information. Run this in the backend directory with:
    python update_hospitals_to_pune.py

This script updates existing hospitals to have:
1. Realistic Pune hospital names
2. Correct Pune coordinates (latitude ~18.5, longitude ~73.8)
3. Appropriate addresses in Pune
4. Reasonable resource allocations (ICU beds, ventilators)
"""

from app.db.database import SessionLocal
from app.models.hospital import Hospital
from app.models.resource import HospitalResource
from app.models.resource import ResourceType
from decimal import Decimal
import random

def update_hospitals_to_pune():
    db = SessionLocal()
    try:
        print("Updating hospital data to reflect real Pune, Maharashtra hospitals...")
        print("=" * 70)

        # List of real Pune hospital names
        pune_hospitals = [
            'Ruby Hall Clinic',
            'Jehangir Hospital',
            'Sahyadri Hospital',
            'Deenanath Mangeshkar Hospital',
            'Aditya Birla Memorial Hospital',
            'KEM Hospital',
            'Bharati Hospital',
            'Momaya Hospital',
            'Oyster & Pearl Hospital',
            'Dinath Mangeshkar Hospital & Research Centre',
            'Lotus Hospital',
            'Columbia Asia Hospital',
            'Manipal Hospital',
            'Seven Hills Hospital',
            'Lifeline Hospital'
        ]

        # Pune coordinate bounds (approximate)
        min_lat, max_lat = Decimal('18.4'), Decimal('18.7')
        min_lng, max_lng = Decimal('73.7'), Decimal('74.0')

        hospitals = db.query(Hospital).all()
        print(f"Found {len(hospitals)} hospitals to update\n")

        for i, hospital in enumerate(hospitals):
            # Update name to be more realistic
            if i < len(pune_hospitals):
                hospital.name = pune_hospitals[i]
            else:
                hospital.name = f'Pune Medical Center {i+1}'

            # Update address to be in Pune
            hospital.address = f'{hospital.name}, Pune, Maharashtra, India'

            # Generate coordinates within Pune bounds (spread them out reasonably)
            # Distribute hospitals across Pune area
            lat_range = max_lat - min_lat
            lng_range = max_lng - min_lng

            # Create a pattern to spread them out
            lat_offset = (i * Decimal('0.012')) % lat_range  # Spread latitude
            lng_offset = (i * Decimal('0.018')) % lng_range  # Spread longitude

            hospital.latitude = min_lat + lat_offset
            hospital.longitude = min_lng + lng_offset

            # Ensure resources exist and have reasonable values
            existing_resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).all()

            if not existing_resources:
                # Create resources if they don't exist
                icu_total = random.randint(8, 25)
                vent_total = random.randint(5, 20)

                icu_resource = HospitalResource(
                    hospital_id=hospital.id,
                    resource_type=ResourceType.ICU_BED,
                    available=random.randint(0, icu_total),
                    total=icu_total
                )
                vent_resource = HospitalResource(
                    hospital_id=hospital.id,
                    resource_type=ResourceType.VENTILATOR,
                    available=random.randint(0, vent_total),
                    total=vent_total
                )
                db.add_all([icu_resource, vent_resource])
                print(f"Created resources for {hospital.name}")
            else:
                # Update existing resources with reasonable values
                for resource in existing_resources:
                    if resource.resource_type == ResourceType.ICU_BED:
                        resource.total = random.randint(8, 25)
                        resource.available = random.randint(0, resource.total)
                    elif resource.resource_type == ResourceType.VENTILATOR:
                        resource.total = random.randint(5, 20)
                        resource.available = random.randint(0, resource.total)

            # Set other fields to reasonable values
            hospital.emergency_level = random.choice(['Level 1', 'Level 2', 'Level 3'])
            hospital.trauma_center = random.choice([True, False])
            hospital.automatic_resource_allocation = random.choice([True, False])
            hospital.status = 'Active'

            # Show what we updated
            print(f"Updated: {hospital.name}")
            print(f"  Location: ({float(hospital.latitude):.4f}, {float(hospital.longitude):.4f})")
            if existing_resources:
                for res in existing_resources:
                    print(f"  {res.resource_type.value}: {res.available}/{res.total} available")
            else:
                print(f"  ICU_BED: {icu_resource.available}/{icu_resource.total} available")
                print(f"  VENTILATOR: {vent_resource.available}/{vent_resource.total} available")
            print()

        # Commit all changes
        db.commit()
        print("=" * 70)
        print(f"SUCCESS: Updated {len(hospitals)} hospitals with Pune-specific data")
        print("\nNext steps:")
        print("1. Restart your backend server to pick up the changes")
        print("2. Test the allocation system - distances should now be realistic (< 50 km within Pune)")
        print("3. Verify in frontend dashboard that hospital distances make sense")

    except Exception as e:
        print(f"Error occurred: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    update_hospitals_to_pune()