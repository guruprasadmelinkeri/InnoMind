import pandas as pd
import numpy as np
import joblib
import math
import json
import random
from typing import Dict, List, Tuple, Any
from model import MediroutePredictor

# Load the predictor model
predictor = MediroutePredictor(
    release_model_path="release_model.joblib",
    availability_model_path="availability_model.joblib"
)

# Load synthetic data
hospital_metadata = pd.read_csv("synthetic_hospital_metadata.csv")
resource_snapshots = pd.read_csv("synthetic_resource_snapshots.csv")

# We'll assign random locations to hospitals (latitude between -90 and 90, longitude between -180 and 180)
# For reproducibility, we set a seed
random.seed(42)
np.random.seed(42)

# Get unique hospital IDs from metadata (or snapshots)
hospital_ids = hospital_metadata['hospital_id'].unique()
# Assign random latitude and longitude to each hospital
hospital_locations = {}
for hid in hospital_ids:
    hospital_locations[hid] = {
        'latitude': np.random.uniform(-90, 90),
        'longitude': np.random.uniform(-180, 180)
    }

# We'll focus on ICU bed requirement for demonstration
requirement = {
    'resource_type': 'icu_bed',
    'quantity': 1,
    'required': True
}
# We'll also need other patient details for the model prediction, such as horizon_minutes, patient_eta_minutes, etc.
# We'll set some default values (can be adjusted)
patient_horizon_minutes = 60
patient_eta_minutes = 30  # estimated time to arrive at the hospital
# Patient location (random)
patient_location = {
    'latitude': np.random.uniform(-90, 90),
    'longitude': np.random.uniform(-180, 180)
}

# Now, let's define the old allocation scoring functions (adapted from backend)
# We'll define helper functions that work with our data structures (pandas rows or dictionaries)

EARTH_RADIUS_KM = 6371.0
DEFAULT_AVERAGE_SPEED_KMH = 30.0
DEFAULT_MAX_TRAVEL_TIME_MINUTES = 60.0

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points
    on the earth (specified in decimal degrees) in kilometers.
    """
    lat1_rad = math.radians(float(lat1))
    lon1_rad = math.radians(float(lon1))
    lat2_rad = math.radians(float(lat2))
    lon2_rad = math.radians(float(lon2))

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance = EARTH_RADIUS_KM * c
    return round(distance, 2)

def calculate_travel_time(distance_km: float, speed_kmh: float = DEFAULT_AVERAGE_SPEED_KMH) -> float:
    """
    Calculate estimated travel time in minutes based on distance and average speed.
    """
    if distance_km <= 0 or speed_kmh <= 0:
        return 0.0
    time_hours = distance_km / speed_kmh
    time_minutes = time_hours * 60.0
    return round(time_minutes, 2)

def calculate_travel_score(
    travel_time_minutes: float,
    max_time_minutes: float = DEFAULT_MAX_TRAVEL_TIME_MINUTES
) -> float:
    """
    Convert travel time in minutes into a score from 0 to 100.
    Shorter travel time yields a higher score.
    """
    if travel_time_minutes <= 0:
        return 100.0
    if travel_time_minutes >= max_time_minutes:
        return 0.0

    score = 100.0 * (1.0 - (travel_time_minutes / max_time_minutes))
    return round(max(0.0, min(100.0, score)), 2)

# Weights for the old allocation engine (from scoring.py)
WEIGHT_RESOURCE_MATCH = 0.45
WEIGHT_TRAVEL = 0.30
WEIGHT_FRESHNESS = 0.15
WEIGHT_SPECIALIZATION = 0.10

def calculate_resource_match_old(
    hospital_row: pd.Series,
    requirement: Dict[str, Any]
) -> Tuple[float, bool, List[str]]:
    """
    Calculate resource match score (0-100), eligibility, and human-readable reasons.
    A hospital is ineligible if any required resource (required=True) is unavailable.
    Adapted from backend/app/services/allocation/scoring.py
    """
    # For simplicity, we assume the requirement is for a single resource type
    req_type = requirement['resource_type']
    req_qty = requirement['quantity']
    req_required = requirement.get('required', True)

    # Get the available resource from the hospital row
    # In our data, we have current_free for the resource type
    avail = hospital_row['current_free'] if pd.notnull(hospital_row['current_free']) else 0

    satisfied_count = 0
    reasons: List[str] = []
    eligible = True

    if avail >= req_qty:
        satisfied_count += 1
        reasons.append(f"Required {req_type} available ({avail}/{req_qty})")
    else:
        if req_required:
            eligible = False
            reasons.append(f"Required {req_type} is unavailable (Available: {avail}, Needed: {req_qty})")
        else:
            reasons.append(f"Optional {req_type} is partially unavailable (Available: {avail}, Needed: {req_qty})")

    # In the original, if there are no requirements, it's eligible with score 100.
    # We'll assume we always have a requirement for this simulation.

    if satisfied_count == 1:  # we have one requirement
        match_score = 100.0
        summary_reasons = ["All required resources are available"]
    else:
        match_score = round((satisfied_count / 1) * 100.0, 2)
        summary_reasons = reasons

    return match_score, eligible, summary_reasons

def calculate_freshness_old(
    hospital_row: pd.Series,
    now: Any = None
) -> Tuple[float, str, str]:
    """
    Calculate data freshness score (0-100), status, and explanation
    based on the oldest last_updated timestamp among hospital resources.
    We don't have timestamps in our synthetic data, so we'll simulate.
    For simplicity, we'll use the data_age_seconds from the snapshot.
    """
    # In our data, we have data_age_seconds
    age_seconds = hospital_row['data_age_seconds'] if pd.notnull(hospital_row['data_age_seconds']) else 0

    if age_seconds <= 30:
        score = 100.0
        status = "VERY_FRESH"
    elif age_seconds <= 120:
        score = 80.0
        status = "FRESH"
    elif age_seconds <= 300:
        score = 50.0
        status = "AGING"
    else:
        score = 20.0
        status = "STALE"

    reason = f"Resource data updated {int(age_seconds)} seconds ago"
    return score, status, reason

def calculate_specialization_old(
    hospital_row: pd.Series,
    emergency_case: Dict[str, Any]
) -> Tuple[float, str]:
    """
    Calculate trauma/specialization match score (0-100) and reason.
    We don't have trauma_center in our data, so we'll assume all hospitals are standard.
    For simplicity, we'll return 100.0.
    """
    # We don't have trauma_center or severity in our emergency_case, so we'll skip.
    # In a real scenario, we would check if the emergency requires trauma and if the hospital is a trauma center.
    # Since we don't have that data, we'll return a default score.
    return 100.0, "Standard care capability matches emergency profile"

def calculate_final_score_old(
    resource_match_score: float,
    travel_score: float,
    freshness_score: float,
    specialization_score: float
) -> float:
    """
    Calculate weighted final score (0-100) rounded to 2 decimal places.
    """
    final = (
        (resource_match_score * WEIGHT_RESOURCE_MATCH) +
        (travel_score * WEIGHT_TRAVEL) +
        (freshness_score * WEIGHT_FRESHNESS) +
        (specialization_score * WEIGHT_SPECIALIZATION)
    )
    return round(max(0.0, min(100.0, final)), 2)

# Now, the new allocation engine that uses the model
def get_model_score(
    hospital_row: pd.Series,
    requirement: Dict[str, Any],
    horizon_minutes: int,
    eta_minutes: int
) -> Dict[str, Any]:
    """
    Use the model to predict availability and release probabilities for the given hospital and resource type.
    We'll combine these into a model score.
    """
    # Prepare telemetry data for the model
    telemetry_data = {
        "hospital_id": hospital_row['hospital_id'],
        "resource_type": requirement['resource_type'],
        "hour_of_day": int(hospital_row['hour_of_day']) if pd.notnull(hospital_row['hour_of_day']) else 0,
        "hospital_demand_factor": float(hospital_row['hospital_demand_factor']) if pd.notnull(hospital_row['hospital_demand_factor']) else 1.0,
        "capacity": int(hospital_row['capacity']) if pd.notnull(hospital_row['capacity']) else 0,
        "current_free": int(hospital_row['current_free']) if pd.notnull(hospital_row['current_free']) else 0,
        "current_occupied": int(hospital_row['current_occupied']) if pd.notnull(hospital_row['current_occupied']) else 0,
        "current_reserved": int(hospital_row['current_reserved']) if pd.notnull(hospital_row['current_reserved']) else 0,
        "current_closed": int(hospital_row['current_closed']) if pd.notnull(hospital_row['current_closed']) else 0,
        "occupancy_ratio": float(hospital_row['occupancy_ratio']) if pd.notnull(hospital_row['occupancy_ratio']) else 0.0,
        "mean_occupied_duration_min": float(hospital_row['mean_occupied_duration_min']) if pd.notnull(hospital_row['mean_occupied_duration_min']) else 0.0,
        "max_occupied_duration_min": float(hospital_row['max_occupied_duration_min']) if pd.notnull(hospital_row['max_occupied_duration_min']) else 0.0,
        "releases_last_30m": int(hospital_row['releases_last_30m']) if pd.notnull(hospital_row['releases_last_30m']) else 0,
        "releases_last_60m": int(hospital_row['releases_last_60m']) if pd.notnull(hospital_row['releases_last_60m']) else 0,
        "releases_last_120m": int(hospital_row['releases_last_120m']) if pd.notnull(hospital_row['releases_last_120m']) else 0,
        "admissions_last_30m": int(hospital_row['admissions_last_30m']) if pd.notnull(hospital_row['admissions_last_30m']) else 0,
        "admissions_last_60m": int(hospital_row['admissions_last_60m']) if pd.notnull(hospital_row['admissions_last_60m']) else 0,
        "admissions_last_120m": int(hospital_row['admissions_last_120m']) if pd.notnull(hospital_row['admissions_last_120m']) else 0,
        "net_occupancy_change_last_60m": int(hospital_row['net_occupancy_change_last_60m']) if pd.notnull(hospital_row['net_occupancy_change_last_60m']) else 0,
        "data_age_seconds": int(hospital_row['data_age_seconds']) if pd.notnull(hospital_row['data_age_seconds']) else 0,
        "patient_eta_minutes": eta_minutes,
        "horizon_minutes": horizon_minutes
    }

    # Get prediction from the model
    prediction = predictor.predict(telemetry_data)

    # We'll use the availability probability as the model score (0-100)
    availability_prob = prediction['availability_prediction']['probability']
    model_score = availability_prob * 100.0  # convert to 0-100 scale

    # We could also incorporate release probability, but for simplicity, we use availability.
    # Alternatively, we could combine both: e.g., (availability + release) / 2 * 100
    # Let's stick with availability for now.

    return {
        "model_score": model_score,
        "availability_prob": availability_prob,
        "release_prob": prediction['release_prediction']['probability'],
        "prediction": prediction
    }

def calculate_final_score_new(
    model_score: float,
    travel_score: float
) -> float:
    """
    For the new engine, we combine model score and travel score with weights.
    We'll use the same weights as resource match and travel from the old engine?
    Or we can define new weights. Let's assume we want to give 70% to model and 30% to travel.
    But note: the old engine had resource match (45%) and travel (30%).
    We are replacing resource match with model score, so we can keep the same weights:
        model_score weight = 0.45, travel_score weight = 0.30, and then we need to account for the missing 25% (freshness and specialization).
    For simplicity, we'll normalize the weights so that model and travel sum to 1.0.
    Alternatively, we can keep the old weights and set freshness and specialization to a fixed value (e.g., 100) for the new engine.
    Let's do:
        final = (model_score * 0.45) + (travel_score * 0.30) + (100 * 0.15) + (100 * 0.10)
    But that would always give a high score due to freshness and specialization.
    Instead, let's assume that in the new engine we are only using model and travel, and we renormalize the weights to sum to 1.0.
    So: weight_model = 0.45 / (0.45+0.30) = 0.6, weight_travel = 0.30 / (0.45+0.30) = 0.4
    We'll do that.
    """
    weight_model = 0.45 / (0.45 + 0.30)
    weight_travel = 0.30 / (0.45 + 0.30)
    final = (model_score * weight_model) + (travel_score * weight_travel)
    return round(max(0.0, min(100.0, final)), 2)

# Now, we run the simulation over time steps (snapshot_tick)
# We'll compute the rank of a specific hospital (e.g., H10) for each time step for both old and new engines.
# We'll choose H10 as the hospital of interest (you can change this).
hospital_of_interest = 'H10'

# Get unique time steps sorted and sample every Nth step to reduce computation
all_time_steps = sorted(resource_snapshots['snapshot_tick'].unique())
sampling_interval = 200  # Process every 200th tick
time_steps = all_time_steps[::sampling_interval]
# We'll store results
time_list = []
old_rank_list = []
new_rank_list = []

print(f"Processing {len(time_steps)} time steps (sampled every {sampling_interval}th tick from {len(all_time_steps)} total)...")
for i, tick in enumerate(time_steps):
    if i % 5 == 0:
        print(f"  Processed {i} time steps...")

    # Filter snapshots for this time tick
    snapshots_tick = resource_snapshots[resource_snapshots['snapshot_tick'] == tick]

    # Merge with metadata to get hospital_factor etc.
    hospital_data_tick = pd.merge(snapshots_tick, hospital_metadata[['hospital_id', 'resource_type', 'hospital_factor']],
                                  on=['hospital_id', 'resource_type'], how='left')

    # Add latitude and longitude from our predefined locations
    hospital_data_tick['latitude'] = hospital_data_tick['hospital_id'].map(lambda x: hospital_locations[x]['latitude'])
    hospital_data_tick['longitude'] = hospital_data_tick['hospital_id'].map(lambda x: hospital_locations[x]['longitude'])

    # We'll compute scores for each hospital in this time step (for the given requirement)
    scores_old = []
    scores_new = []

    for _, hospital_row in hospital_data_tick.iterrows():
        # Skip if the hospital doesn't have the required resource type? Actually, we have data for each resource type per hospital.
        # We are iterating over rows that are for the specific resource type?
        # Note: hospital_data_tick has one row per hospital per resource type (from the merge).
        # We are only interested in the resource type that the patient requires.
        if hospital_row['resource_type'] != requirement['resource_type']:
            continue

        # Calculate distance and travel score
        dist_km = haversine_distance(
            patient_location['latitude'],
            patient_location['longitude'],
            hospital_row['latitude'],
            hospital_row['longitude']
        )
        travel_min = calculate_travel_time(dist_km)
        travel_score = calculate_travel_score(travel_min)

        # Old allocation engine
        resource_match_score_old, eligible_old, _ = calculate_resource_match_old(hospital_row, requirement)
        freshness_score_old, _, _ = calculate_freshness_old(hospital_row)
        specialization_score_old, _ = calculate_specialization_old(hospital_row, {})  # we don't have emergency case details
        final_score_old = calculate_final_score_old(
            resource_match_score_old,
            travel_score,
            freshness_score_old,
            specialization_score_old
        )

        # New allocation engine (with model)
        model_result = get_model_score(
            hospital_row,
            requirement,
            horizon_minutes=patient_horizon_minutes,
            eta_minutes=patient_eta_minutes
        )
        model_score = model_result['model_score']
        final_score_new = calculate_final_score_new(model_score, travel_score)

        scores_old.append((hospital_row['hospital_id'], final_score_old))
        scores_new.append((hospital_row['hospital_id'], final_score_new))

    # Convert to DataFrame for ranking
    df_old = pd.DataFrame(scores_old, columns=['hospital_id', 'score'])
    df_new = pd.DataFrame(scores_new, columns=['hospital_id', 'score'])

    # Rank hospitals by score (descending) - rank 1 is highest score
    df_old['rank'] = df_old['score'].rank(ascending=False, method='first').astype(int)
    df_new['rank'] = df_new['score'].rank(ascending=False, method='first').astype(int)

    # Get the rank of the hospital of interest
    old_rank_row = df_old[df_old['hospital_id'] == hospital_of_interest]
    new_rank_row = df_new[df_new['hospital_id'] == hospital_of_interest]

    if not old_rank_row.empty and not new_rank_row.empty:
        old_rank = int(old_rank_row['rank'].iloc[0])
        new_rank = int(new_rank_row['rank'].iloc[0])
    else:
        # If the hospital of interest doesn't have data for this resource type at this time, skip?
        # But we expect it to always have data.
        old_rank = np.nan
        new_rank = np.nan

    time_list.append(tick)
    old_rank_list.append(old_rank)
    new_rank_list.append(new_rank)

print("Finished processing time steps.")

# Convert numpy types to native Python types for JSON serialization
time_list = [int(t) for t in time_list]
old_rank_list = [int(r) if not np.isnan(r) else None for r in old_rank_list]
new_rank_list = [int(r) if not np.isnan(r) else None for r in new_rank_list]

# Prepare data for JSON
data = {
    "time_steps": time_list,
    "hospital_of_interest": hospital_of_interest,
    "old_engine_ranks": old_rank_list,
    "new_engine_ranks": new_rank_list
}

# Write to JSON file
with open("simulation_data.json", "w") as f:
    json.dump(data, f, indent=2)

print("JSON data file created: simulation_data.json")