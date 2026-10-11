"""Local API for the MediRoute allocation simulation dashboard."""

from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from model import MediroutePredictor


ROOT = Path(__file__).resolve().parent
RESOURCE_TYPES = ["icu_bed", "general_bed", "ventilator", "operating_room"]
RESOURCE_LABELS = {
    "icu_bed": "ICU bed",
    "general_bed": "General bed",
    "ventilator": "Ventilator",
    "operating_room": "Operating room",
}
SPEED_KMH = 30.0
MAX_TRAVEL_MINUTES = 60.0
EARTH_RADIUS_KM = 6371.0
PATIENTS_PER_SNAPSHOT = 10

app = FastAPI(title="MediRoute Simulation")
LAST_RUN_RESULT: dict[str, Any] | None = None


def _read_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    snapshots = pd.read_csv(ROOT / "synthetic_resource_snapshots.csv")
    metadata = pd.read_csv(ROOT / "synthetic_hospital_metadata.csv")
    events = pd.read_csv(ROOT / "synthetic_hospital_events.csv")
    snapshots = snapshots.merge(metadata[["hospital_id", "resource_type", "hospital_factor"]],
                                on=["hospital_id", "resource_type"], how="left")
    return snapshots, metadata, events


SNAPSHOTS, METADATA, EVENTS = _read_data()
TICKS = sorted(int(tick) for tick in SNAPSHOTS["snapshot_tick"].unique())
TICK_MINUTES = {int(row.snapshot_tick): int(row.snapshot_minute)
                for row in SNAPSHOTS[["snapshot_tick", "snapshot_minute"]].drop_duplicates().itertuples()}
HOSPITALS = sorted(SNAPSHOTS["hospital_id"].unique())
_rng = random.Random(42)
HOSPITAL_LOCATIONS = {
    hospital: {"latitude": _rng.uniform(12.8, 13.2), "longitude": _rng.uniform(77.4, 77.8)}
    for hospital in HOSPITALS
}
PATIENT_LOCATIONS = [
    {"latitude": 12.9716 + _rng.uniform(-0.12, 0.12), "longitude": 77.5946 + _rng.uniform(-0.12, 0.12)}
    for _ in range(32)
]
PREDICTOR = MediroutePredictor(
    release_model_path=str(ROOT / "release_model.joblib"),
    availability_model_path=str(ROOT / "availability_model.joblib"),
)


class PatientRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=30)
    resource_type: str
    quantity: int = Field(default=1, ge=1, le=4)
    eta_minutes: int = Field(default=25, ge=0, le=180)
    horizon_minutes: int = Field(default=60, ge=15, le=240)
    severity: str = "HIGH"
    location_index: int = Field(default=0, ge=0, le=31)


class RunRequest(BaseModel):
    start_tick: int
    requests: list[PatientRequest] = Field(min_length=1, max_length=80)


def _distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def _travel(distance: float) -> tuple[float, float]:
    minutes = round(distance / SPEED_KMH * 60, 2) if distance > 0 else 0.0
    return minutes, round(max(0.0, min(100.0, 100 * (1 - minutes / MAX_TRAVEL_MINUTES))), 2)


def _freshness(age: int) -> tuple[float, str]:
    if age <= 30:
        return 100.0, "VERY_FRESH"
    if age <= 120:
        return 80.0, "FRESH"
    if age <= 300:
        return 50.0, "AGING"
    return 20.0, "STALE"


def _telemetry(row: dict[str, Any], request: PatientRequest) -> dict[str, Any]:
    defaults = {
        "hour_of_day": 0, "hospital_demand_factor": 1.0, "capacity": 0,
        "current_free": 0, "current_occupied": 0, "current_reserved": 0,
        "current_closed": 0, "occupancy_ratio": 0.0,
        "mean_occupied_duration_min": 0.0, "max_occupied_duration_min": 0.0,
        "releases_last_30m": 0, "releases_last_60m": 0, "releases_last_120m": 0,
        "admissions_last_30m": 0, "admissions_last_60m": 0, "admissions_last_120m": 0,
        "net_occupancy_change_last_60m": 0, "data_age_seconds": 0,
    }
    result = {key: (int(value) if key not in {"hospital_demand_factor", "occupancy_ratio", "mean_occupied_duration_min", "max_occupied_duration_min"} else float(value))
              for key, value in defaults.items()}
    for key in defaults:
        value = row.get(key, defaults[key])
        result[key] = int(value) if key not in {"hospital_demand_factor", "occupancy_ratio", "mean_occupied_duration_min", "max_occupied_duration_min"} else float(value)
    result.update(hospital_id=str(row["hospital_id"]), resource_type=request.resource_type,
                  patient_eta_minutes=request.eta_minutes, horizon_minutes=request.horizon_minutes)
    return result


def _rank_one(tick: int, request: PatientRequest, mode: str, inventory: dict[tuple[str, str], int],
              allocations: dict[tuple[str, str], int]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    minute = TICK_MINUTES[tick]
    state = SNAPSHOTS[(SNAPSHOTS.snapshot_tick == tick) & (SNAPSHOTS.resource_type == request.resource_type)]
    if state.empty:
        raise HTTPException(status_code=404, detail=f"No {request.resource_type} data at snapshot {tick}")
    patient = PATIENT_LOCATIONS[request.location_index]
    state_rows = state.to_dict("records")
    predictions: dict[str, dict[str, Any]] = {}
    if mode == "model":
        telemetry_rows = []
        hospital_ids = []
        for source in state_rows:
            hid = str(source["hospital_id"])
            held = allocations.get((hid, request.resource_type), 0)
            raw = dict(source)
            raw["current_free"] = max(0, int(source["current_free"]) - held)
            raw["current_occupied"] = int(source["current_occupied"]) + held
            raw["occupancy_ratio"] = min(1.0, raw["current_occupied"] / max(1, int(source["capacity"])))
            telemetry_rows.append(_telemetry(raw, request))
            hospital_ids.append(hid)
        predictions = dict(zip(hospital_ids, PREDICTOR.predict_many(telemetry_rows)))
    candidates: list[dict[str, Any]] = []
    for row in state_rows:
        hid = str(row["hospital_id"])
        key = (hid, request.resource_type)
        # Synthetic inventory is the ground truth at this snapshot. Persist our own simulated bookings
        # across snapshots, clipping to the synthetic capacity observed at the current time.
        base_free = int(row["current_free"])
        held = allocations.get(key, 0)
        free = max(0, base_free - held)
        inventory[key] = free
        distance = _distance(patient["latitude"], patient["longitude"],
                             HOSPITAL_LOCATIONS[hid]["latitude"], HOSPITAL_LOCATIONS[hid]["longitude"])
        travel_minutes, travel_score = _travel(distance)
        age = int(row["data_age_seconds"])
        freshness_score, freshness_status = _freshness(age)
        raw = dict(row)
        raw["current_free"] = free
        raw["current_occupied"] = int(row["current_occupied"]) + held
        raw["occupancy_ratio"] = min(1.0, raw["current_occupied"] / max(1, int(row["capacity"])))
        if mode == "backend":
            eligible = free >= request.quantity
            resource_score = 100.0 if eligible else 0.0
            specialization = 100.0  # Synthetic metadata contains no trauma designation; backend's standard-care fallback.
            score = round(resource_score * 0.45 + travel_score * 0.30 + freshness_score * 0.15 + specialization * 0.10, 2)
            detail = {"resource_match": resource_score, "travel": travel_score, "freshness": freshness_score,
                      "specialization": specialization, "freshness_status": freshness_status}
        else:
            prediction = predictions[hid]
            available = prediction["availability_prediction"]["probability"]
            release = prediction["release_prediction"]["probability"]
            # Availability estimates readiness at patient arrival; predicted release contributes to
            # readiness only for currently occupied capacity, without bypassing capacity limits.
            effective_ready = min(1.0, available + release * (1.0 - free / max(1, int(row["capacity"]))))
            # Forecasts influence ranking, but a reservation must be backed by
            # a unit that is actually free in the observed snapshot.
            eligible = free >= request.quantity
            readiness = round(effective_ready * 100, 2)
            score = round(readiness * 0.60 + travel_score * 0.40, 2)
            detail = {"readiness": readiness, "availability_probability": round(available * 100, 2),
                      "release_probability": round(release * 100, 2), "travel": travel_score,
                      "availability_std": round(prediction["availability_prediction"]["disagreement_std"] * 100, 2),
                      "release_std": round(prediction["release_prediction"]["disagreement_std"] * 100, 2)}
        candidates.append({
            "hospital_id": hid, "score": score, "eligible": eligible,
            "available_now": free, "capacity": int(row["capacity"]), "distance_km": distance,
            "travel_minutes": travel_minutes, "detail": detail,
        })
    candidates.sort(key=lambda item: (item["eligible"], item["score"]), reverse=True)
    eligible_rank = 0
    for candidate in candidates:
        if candidate["eligible"]:
            eligible_rank += 1
            candidate["rank"] = eligible_rank
        else:
            candidate["rank"] = None
    winner = next((item for item in candidates if item["eligible"]), None)
    return candidates, {"winner": winner, "minute": minute, "patient": patient}


def _apply_due_releases(minute: int, allocations: dict[tuple[str, str], int],
                        scheduled: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply simulated patient discharges when their service interval ends."""
    updates = []
    pending = []
    for event in scheduled:
        if event["minute"] > minute:
            pending.append(event)
            continue
        key = (event["hospital_id"], event["resource_type"])
        booked = allocations.get(key, 0)
        freed = min(booked, event["units"])
        if freed:
            allocations[key] = booked - freed
            updates.append({**event, "units": freed})
    scheduled[:] = pending
    return updates


def _build_run(payload: RunRequest) -> dict[str, Any]:
    if payload.start_tick not in TICK_MINUTES:
        raise HTTPException(status_code=400, detail="Unknown snapshot tick")
    # Keep request order supplied by the UI; request cadence maps onto subsequent real snapshots.
    start_index = TICKS.index(payload.start_tick)
    model_allocations: dict[tuple[str, str], int] = {}
    backend_allocations: dict[tuple[str, str], int] = {}
    model_schedule: list[dict[str, Any]] = []
    backend_schedule: list[dict[str, Any]] = []
    timeline = []
    model_wins = backend_wins = 0
    for index, request in enumerate(payload.requests):
        # Process a cohort of arrivals per observed 15-minute snapshot. This keeps a
        # larger demo cohort inside a short, readable simulation window.
        tick = TICKS[min(start_index + index // PATIENTS_PER_SNAPSHOT, len(TICKS) - 1)]
        model_releases = _apply_due_releases(TICK_MINUTES[tick], model_allocations, model_schedule)
        backend_releases = _apply_due_releases(TICK_MINUTES[tick], backend_allocations, backend_schedule)
        # Snapshot inventory refreshes at each group boundary; simulated holds are
        # applied to it until their scheduled discharge times.
        model_rows, model_context = _rank_one(tick, request, "model", {}, model_allocations)
        backend_rows, backend_context = _rank_one(tick, request, "backend", {}, backend_allocations)
        model_winner = model_context["winner"]
        backend_winner = backend_context["winner"]
        if model_winner:
            key = (model_winner["hospital_id"], request.resource_type)
            model_allocations[key] = model_allocations.get(key, 0) + request.quantity
            service_minutes = 30 + (index % 3) * 15
            model_schedule.append({"minute": TICK_MINUTES[tick] + service_minutes,
                                   "hospital_id": key[0], "resource_type": key[1], "units": request.quantity})
            model_wins += 1
        if backend_winner:
            key = (backend_winner["hospital_id"], request.resource_type)
            backend_allocations[key] = backend_allocations.get(key, 0) + request.quantity
            service_minutes = 30 + (index % 3) * 15
            backend_schedule.append({"minute": TICK_MINUTES[tick] + service_minutes,
                                     "hospital_id": key[0], "resource_type": key[1], "units": request.quantity})
            backend_wins += 1
        for candidates, winner in ((model_rows, model_winner), (backend_rows, backend_winner)):
            for candidate in candidates:
                reserved = request.quantity if winner and winner["hospital_id"] == candidate["hospital_id"] else 0
                candidate["reserved_this_request"] = reserved
                candidate["remaining_after"] = max(0, candidate["available_now"] - reserved)
        timeline.append({
            "request": request.dict(), "tick": tick, "minute": TICK_MINUTES[tick],
            "model": {"winner": model_winner, "candidates": model_rows,
                      "releases": model_releases, "active_allocations": sum(model_allocations.values())},
            "backend": {"winner": backend_winner, "candidates": backend_rows,
                        "releases": backend_releases, "active_allocations": sum(backend_allocations.values())},
            "patient_location": model_context["patient"],
        })
    def strategy_metrics(strategy: str) -> dict[str, Any]:
        wins = [item[strategy]["winner"] for item in timeline if item[strategy]["winner"]]
        candidates = [candidate for item in timeline for candidate in item[strategy]["candidates"]]
        readiness = [candidate["detail"].get("readiness", candidate["detail"].get("availability_probability", 0)) for candidate in candidates]
        return {
            "allocated": len(wins),
            "units_reserved": sum(item[strategy]["winner"] and item["request"]["quantity"] or 0 for item in timeline),
            "unallocated": len(timeline) - len(wins),
            "allocation_rate": round(100 * len(wins) / max(1, len(timeline)), 1),
            "mean_travel_minutes": round(sum(w["travel_minutes"] for w in wins) / max(1, len(wins)), 1),
            "mean_winning_score": round(sum(w["score"] for w in wins) / max(1, len(wins)), 1),
            "mean_candidate_readiness": round(sum(readiness) / max(1, len(readiness)), 1),
            "eligible_candidate_count": sum(1 for c in candidates if c["eligible"]),
        }

    return {
        "timeline": timeline,
        "summary": {"request_count": len(payload.requests), "model_allocated": model_wins,
                    "backend_allocated": backend_wins,
                    "agreement": sum(1 for item in timeline if item["model"]["winner"] and item["backend"]["winner"] and
                                     item["model"]["winner"]["hospital_id"] == item["backend"]["winner"]["hospital_id"]),
                    "start_minute": TICK_MINUTES[payload.start_tick],
                    "end_minute": timeline[-1]["minute"],
                    "model_metrics": strategy_metrics("model"),
                    "backend_metrics": strategy_metrics("backend")},
        "methodology": {
            "model": "Model forecasts estimate readiness from availability and release likelihood; eligible hospitals still need enough observed free units. Score = 60% readiness + 40% travel.",
            "backend": "Required resources must be available now; eligible hospitals rank by 45% resource match + 30% travel + 15% freshness + 10% specialization, matching backend scoring weights.",
            "releases": "Both ledgers release each simulated reservation after a 30–60 minute service interval, so later arrivals can reuse the capacity.",
        },
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "simulation_dashboard.html")


@app.get("/comparison")
def comparison_page() -> FileResponse:
    return FileResponse(ROOT / "simulation_comparison.html")


@app.get("/api/comparison")
def comparison_data() -> dict[str, Any]:
    if LAST_RUN_RESULT is None:
        raise HTTPException(status_code=404, detail="Run a simulation first to populate the full comparison")
    return LAST_RUN_RESULT


@app.get("/api/config")
def config() -> dict[str, Any]:
    return {"ticks": TICKS, "start_tick": TICKS[0],
            "resources": [{"value": key, "label": RESOURCE_LABELS[key]} for key in RESOURCE_TYPES],
            "hospitals": len(HOSPITALS), "snapshot_count": len(TICKS),
            "snapshot_minutes": [TICK_MINUTES[tick] for tick in TICKS]}


@app.post("/api/run")
def run_simulation(payload: RunRequest) -> dict[str, Any]:
    global LAST_RUN_RESULT
    if any(request.resource_type not in RESOURCE_TYPES for request in payload.requests):
        raise HTTPException(status_code=400, detail="Unsupported resource type")
    LAST_RUN_RESULT = _build_run(payload)
    return LAST_RUN_RESULT


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("simulation_server:app", host="127.0.0.1", port=8765, reload=False)
