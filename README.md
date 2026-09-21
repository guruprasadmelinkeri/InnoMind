# MediRoute — Real-Time Emergency Resource Allocator

## 1. Project Overview
**MediRoute** is a prototype real-time emergency resource allocation system designed to assist ambulance dispatchers in identifying suitable hospitals based on available resources, travel times, and data freshness. The platform allows hospitals to confirm or reject incoming requests and manage resource reservations to prevent double-booking.

## 2. Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Axios
- **Backend**: Python 3.10+, FastAPI, Pydantic, SQLAlchemy, Alembic, Pytest
- **Database**: PostgreSQL (Dockerized or local instance)
- **Containerization**: Docker Compose (Database)

## 3. Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- Docker & Docker Compose (or local PostgreSQL instance)

### Step 1: Clone & Environment Setup
Ensure environment configuration files are created:
```bash
# Backend environment setup
cp backend/.env.example backend/.env
```

### Step 2: Database Setup & Container Startup
Start the PostgreSQL container:
```bash
docker-compose up -d
# or using Docker CLI v2:
docker compose up -d
```

### Step 3: Backend Environment Setup & Migrations
Navigate to the `backend` directory:
```bash
cd backend
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt

# Run database migrations with Alembic
alembic upgrade head

# Seed initial sample hospitals and sample emergency case
python scripts/seed.py

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```
- Backend API root: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`
- Health check endpoint: `http://localhost:8000/health`

### Step 4: Frontend Setup & Execution
In a new terminal, navigate to the `frontend` directory:
```bash
cd frontend
npm install
npm run dev
```
Frontend application will be accessible at: `http://localhost:5173`

---

## 4. Database Migrations, Seeding & Tests

### Run Migrations
```bash
cd backend
alembic upgrade head
```

### Seed Sample Data
Populates sample hospitals (`CityCare Hospital`, `Metro General Hospital`, `Apex Trauma Center`) and a sample emergency case (`ER-000001`):
```bash
cd backend
python scripts/seed.py
```

### Run Automated Unit & Integration Tests
Run the test suite for emergency cases and allocation algorithms:
```bash
cd backend
pytest tests/test_allocation.py tests/test_emergencies.py
```

---

## 5. Hospital Allocation & Ranking Engine

### Scoring Formula
Hospitals are evaluated and ranked based on a weighted composite score (0-100):

$$\text{Final Score} = (\text{Resource Match} \times 0.45) + (\text{Travel Score} \times 0.30) + (\text{Freshness Score} \times 0.15) + (\text{Specialization Score} \times 0.10)$$

1. **Resource Match Score (45%)**:
   - Compares required resource quantities against hospital `available` counts.
   - If a hospital lacks any mandatory resource (`required = true`), it is marked `eligible = false` and moved to `ineligible_hospitals`.
2. **Travel Score (30%)**:
   - Distance is computed via the Haversine formula using pickup & hospital coordinates.
   - Estimated travel time: $\text{minutes} = \frac{\text{distance\_km}}{30.0 \text{ km/h}} \times 60$.
   - Score decays linearly from 100 (0 mins) to 0 (60+ mins).
3. **Data Freshness Score (15%)**:
   - Evaluates the oldest `last_updated` timestamp among relevant hospital resources:
     - `0 - 30s`: **100** (`VERY_FRESH`)
     - `31 - 120s`: **80** (`FRESH`)
     - `121 - 300s`: **50** (`AGING`)
     - `> 300s`: **20** (`STALE`)
4. **Specialization Score (10%)**:
   - Gives **100** if the emergency involves trauma/critical severity and the hospital is a certified `trauma_center`. Returns **0** if a trauma center is lacking for high severity cases.

---

## 6. Available API Endpoints

### System
- `GET /health` — Check system API status

### Hospitals & Resources (`/api/hospitals`)
- `GET /api/hospitals` — List all hospitals with resource capacity
- `GET /api/hospitals/{hospital_id}` — Get details of a specific hospital by ID
- `POST /api/hospitals` — Register a new hospital
- `GET /api/hospitals/{hospital_id}/resources` — Retrieve resource availability for a specific hospital
- `POST /api/hospitals/{hospital_id}/resources` — Add or update resource records for a hospital

### Emergency Cases (`/api/emergencies`)
- `POST /api/emergencies` — Create a new emergency case with resource requirements
- `GET /api/emergencies` — List all emergency cases
- `GET /api/emergencies/{emergency_id}` — Get details of an emergency case with requirements
- `PATCH /api/emergencies/{emergency_id}/status` — Update emergency case status (`CREATED`, `SEARCHING`, `HOSPITAL_SELECTED`, `EN_ROUTE`, `ARRIVED`, `HANDOFF_COMPLETED`, `CANCELLED`)
- `DELETE /api/emergencies/{emergency_id}` — Cancel/delete an emergency case

### Allocation & Ranking (`/api/emergencies/{emergency_id}/recommendations`)
- `GET /api/emergencies/{emergency_id}/recommendations` — Return ranked eligible hospitals and separate list of ineligible hospitals with explainable scoring breakdown.

---

## 7. Example Recommendation Request & Response

```bash
curl -X GET "http://localhost:8000/api/emergencies/1/recommendations"
```

**Response (`200 OK`):**
```json
{
  "emergency": {
    "id": 1,
    "case_number": "ER-000001",
    "severity": "CRITICAL",
    "patient_age": 34,
    "description": "CRITICAL multi-vehicle collision on Highway 101",
    "pickup_latitude": 37.775,
    "pickup_longitude": -122.418,
    "status": "CREATED",
    "created_at": "2026-09-20T20:06:10.825227Z",
    "updated_at": "2026-09-20T20:06:10.825227Z",
    "requirements": [
      {
        "id": 1,
        "emergency_case_id": 1,
        "resource_type": "ICU_BED",
        "quantity": 1,
        "required": true
      }
    ]
  },
  "recommendations": [
    {
      "hospital_id": 1,
      "hospital_name": "CityCare Hospital",
      "eligible": true,
      "final_score": 98.32,
      "resource_match_score": 100.0,
      "travel_score": 99.84,
      "freshness_score": 100.0,
      "specialization_score": 100.0,
      "distance_km": 0.08,
      "estimated_travel_minutes": 0.16,
      "freshness_status": "VERY_FRESH",
      "reasons": [
        "All required resources are available",
        "Trauma center available",
        "Resource data updated 15 seconds ago",
        "Estimated travel time: 0.16 minutes"
      ]
    }
  ],
  "ineligible_hospitals": [
    {
      "hospital_id": 3,
      "hospital_name": "Suburban Clinic",
      "eligible": false,
      "final_score": 45.2,
      "resource_match_score": 0.0,
      "travel_score": 75.0,
      "freshness_score": 100.0,
      "specialization_score": 0.0,
      "distance_km": 7.5,
      "estimated_travel_minutes": 15.0,
      "freshness_status": "VERY_FRESH",
      "reasons": [
        "Required VENTILATOR is unavailable (Available: 0, Needed: 1)",
        "Hospital lacks certified trauma center",
        "Resource data updated 10 seconds ago",
        "Estimated travel time: 15.0 minutes"
      ]
    }
  ]
}
```

---

## 8. Current Implementation Status
- **Phase 1 Complete**: Project foundation, FastAPI backend, React Vite frontend, Tailwind styling, `/health` endpoint.
- **Phase 2 Complete**: SQLAlchemy models for `Hospital` & `HospitalResource`, Alembic setup, Pydantic schemas, hospital CRUD APIs.
- **Phase 3 Complete**: `EmergencyCase` & `EmergencyRequirement` models, validation, emergency CRUD APIs, Pytest suite.
- **Phase 4 Complete**:
  - Independent allocation engine in `app/services/allocation/` (`distance.py`, `scoring.py`, `allocation_service.py`).
  - Haversine geographical distance and travel time calculation.
  - Resource match evaluation and ineligible hospital filtering.
  - Data freshness classification (`VERY_FRESH`, `FRESH`, `AGING`, `STALE`).
  - Trauma specialization matching.
  - `GET /api/emergencies/{emergency_id}/recommendations` API returning explainable, ranked hospital recommendations.
  - Pytest test suite (`tests/test_allocation.py`) verifying all distance, travel, freshness, trauma, and ranking calculations.
