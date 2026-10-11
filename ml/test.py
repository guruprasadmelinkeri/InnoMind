import pandas as pd
print("Pandas version:", pd.__version__)
import joblib
print("Joblib loaded")
from model import MediroutePredictor
print("Model imported")
predictor = MediroutePredictor(
    release_model_path="release_model.joblib",
    availability_model_path="availability_model.joblib"
)
print("Predictor created")
# Try a prediction on a dummy row
dummy = {
    "hospital_id": "H01",
    "resource_type": "icu_bed",
    "hour_of_day": 12,
    "hospital_demand_factor": 1.0,
    "capacity": 10,
    "current_free": 5,
    "current_occupied": 5,
    "current_reserved": 0,
    "current_closed": 0,
    "occupancy_ratio": 0.5,
    "mean_occupied_duration_min": 300.0,
    "max_occupied_duration_min": 600.0,
    "releases_last_30m": 0,
    "releases_last_60m": 0,
    "releases_last_120m": 0,
    "admissions_last_30m": 0,
    "admissions_last_60m": 0,
    "admissions_last_120m": 0,
    "net_occupancy_change_last_60m": 0,
    "data_age_seconds": 0,
    "patient_eta_minutes": 30,
    "horizon_minutes": 60
}
pred = predictor.predict(dummy)
print("Prediction:", pred)
print("Test successful")