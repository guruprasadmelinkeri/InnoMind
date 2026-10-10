#!/usr/bin/env python3
"""Data for real Pune hospitals."""

PUNE_HOSPITALS = [
    {
        "name": "Sahyadri Super Speciality Hospital, Deccan",
        "address": "Sahyadri Hospital, 30-C, Erandwane, Near Deccan Gymkhana, Pune, Maharashtra 411004",
        "latitude": 18.5104,
        "longitude": 73.8402,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Jehangir Hospital",
        "address": "32, Sassoon Rd, Pune, Maharashtra 411001",
        "latitude": 18.5236,
        "longitude": 73.8555,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Sancheti Hospital",
        "address": "11, Thube Park, Shivajinagar, Pune, Maharashtra 411005",
        "latitude": 18.5309,
        "longitude": 73.8491,
        "emergency_level": "Level 2",  # Specialized orthopedic hospital
        "trauma_center": False,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Noble Hospitals & Research Centre",
        "address": "153, Narayan Peth, Near Natu Baug, Pune, Maharashtra 411030",
        "latitude": 18.5026,
        "longitude": 73.8684,
        "emergency_level": "Level 2",
        "trauma_center": False,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Manipal Hospital, Kharadi",
        "address": "303, Bustop, Samrat Ashok Path, Kharadi, Pune, Maharashtra 411014",
        "latitude": 18.5804,
        "longitude": 73.9406,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Ranka Hospital",
        "address": "442/1, Ghorpade Peth, Near Ghorpade Chowk, Pune, Maharashtra 411042",
        "latitude": 18.5002,
        "longitude": 73.8768,
        "emergency_level": "Level 2",
        "trauma_center": False,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Ruby Hall Clinic",
        "address": "40, Sassoon Rd, Pune, Maharashtra 411001",
        "latitude": 18.5244,
        "longitude": 73.8572,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Deenanath Mangeshkar Hospital",
        "address": "Erandwane, Near Mhatma Gandhi Bus Stop, Pune, Maharashtra 411004",
        "latitude": 18.5089,
        "longitude": 73.8118,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    },
    {
        "name": "Aditya Birla Memorial Hospital",
        "address": "Aditya Birla Hospital Rd, Thergaon, Pune, Maharashtra 411033",
        "latitude": 18.6104,
        "longitude": 73.7806,
        "emergency_level": "Level 1",
        "trauma_center": True,
        "automatic_resource_allocation": True,
        "status": "Active"
    }
]

# For testing/demo purposes, we'll mark resources as simulated data
def get_simulated_resources():
    """Return simulated resource data - clearly marked as demo data."""
    return [
        {
            "resource_type": "ICU_BED",
            "total": 20,
            "available": 15,  # 75% available for demo
            "reserved": 3
        },
        {
            "resource_type": "GENERAL_BED",
            "total": 50,
            "available": 35,  # 70% available for demo
            "reserved": 5
        },
        {
            "resource_type": "VENTILATOR",
            "total": 15,
            "available": 10,  # 67% available for demo
            "reserved": 2
        },
        {
            "resource_type": "OXYGEN_BED",
            "total": 30,
            "available": 22,  # 73% available for demo
            "reserved": 4
        },
        {
            "resource_type": "OPERATING_ROOM",
            "total": 8,
            "available": 6,  # 75% available for demo
            "reserved": 1
        }
    ]

if __name__ == "__main__":
    print("Pune Hospitals Data:")
    for i, hospital in enumerate(PUNE_HOSPITALS, 1):
        print(f"{i}. {hospital['name']}")
        print(f"   Address: {hospital['address']}")
        print(f"   Coordinates: ({hospital['latitude']}, {hospital['longitude']})")
        print()

    print("Simulated Resources (clearly marked as demo data):")
    for resource in get_simulated_resources():
        print(f"- {resource['resource_type']}: Total={resource['total']}, Available={resource['available']}, Reserved={resource['reserved']}")