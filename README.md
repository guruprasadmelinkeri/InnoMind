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
Populates 3 sample hospitals (`CityCare Hospital`, `Metro General Hospital`, `Apex Trauma Center`) and 1 sample emergency case (`ER-000001`):
```bash
cd backend
python scripts/seed.py
```

### Run Automated Unit Tests
Run the emergency module test suite:
```bash
cd backend
pytest tests/test_emergencies.py
```

---

## 5. Available API Endpoints

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

---

## 6. Example Request: Create Emergency Case

```bash
curl -X POST "http://localhost:8000/api/emergencies" \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "CRITICAL",
    "patient_age": 34,
    "description": "Multi-vehicle accident with critical head trauma",
    "pickup_latitude": 37.775000,
    "pickup_longitude": -122.418000,
    "requirements": [
      {
        "resource_type": "ICU_BED",
        "quantity": 1,
        "required": true
      },
      {
        "resource_type": "VENTILATOR",
        "quantity": 1,
        "required": true
      },
      {
        "resource_type": "TRAUMA_BED",
        "quantity": 1,
        "required": true
      }
    ]
  }'
```

**Response (`201 Created`):**
```json
{
  "id": 1,
  "case_number": "ER-000001",
  "severity": "CRITICAL",
  "patient_age": 34,
  "description": "Multi-vehicle accident with critical head trauma",
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
      "required": true,
      "created_at": "2026-09-20T20:06:10.828456Z",
      "updated_at": "2026-09-20T20:06:10.828456Z"
    }
  ]
}
```

---

## 7. Current Implementation Status
- **Phase 1 Complete**: Project foundation, FastAPI backend, React Vite frontend, Tailwind styling, `/health` endpoint.
- **Phase 2 Complete**: SQLAlchemy models for `Hospital` & `HospitalResource`, Alembic setup, Pydantic schemas, hospital CRUD APIs.
- **Phase 3 Complete**:
  - `EmergencyCase` and `EmergencyRequirement` SQLAlchemy models with sequential case numbers (`ER-000001`).
  - Validation for coordinates (-90..90, -180..180), patient age (0..120), positive quantities (>0), and non-empty requirements list.
  - Alembic migration `d15c93812f8f` establishing emergency tables.
  - Emergency CRUD APIs (`POST`, `GET`, `PATCH status`, `DELETE`).
  - Automated Pytest suite (`backend/tests/test_emergencies.py`) testing all validation rules and endpoint operations.
  - Seed script updated with sample critical emergency case.
