# MediRoute — Real-Time Emergency Resource Allocator

## 1. Project Overview
**MediRoute** is a prototype real-time emergency resource allocation system designed to assist ambulance dispatchers in identifying suitable hospitals based on available resources, travel times, and data freshness. The platform allows hospitals to confirm or reject incoming requests and manage resource reservations to prevent double-booking.

## 2. Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Axios
- **Backend**: Python 3.10+, FastAPI, Pydantic, SQLAlchemy, Alembic
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

# Seed initial sample hospital data (CityCare, Metro General, Apex Trauma Center)
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

## 4. Database Migrations & Seeding Commands

### Run Migrations
```bash
cd backend
alembic upgrade head
```

### Generate New Migration
```bash
cd backend
alembic revision --autogenerate -m "Descriptive migration message"
```

### Rollback Migration
```bash
cd backend
alembic downgrade -1
```

### Seed Sample Data
Populates 3 fictional hospitals (`CityCare Hospital`, `Metro General Hospital`, `Apex Trauma Center`) with resources (`ICU_BED`, `VENTILATOR`, `OXYGEN_BED`, `GENERAL_BED`, `TRAUMA_BED`, `OPERATING_ROOM`):
```bash
cd backend
python scripts/seed.py
```

---

## 5. Available API Endpoints

### System
- `GET /health` — Check system API status

### Hospitals & Resources CRUD (`/api/hospitals`)
- `GET /api/hospitals` — List all hospitals with resource capacity
- `GET /api/hospitals/{hospital_id}` — Get details of a specific hospital by ID
- `POST /api/hospitals` — Register a new hospital
- `GET /api/hospitals/{hospital_id}/resources` — Retrieve resource availability for a specific hospital
- `POST /api/hospitals/{hospital_id}/resources` — Add or update resource records for a hospital

---

## 6. Current Implementation Status
- **Phase 1 Complete**: Initial project structure, FastAPI server, Vite React frontend, Tailwind styling, Axios service, `/health` endpoint.
- **Phase 2 Complete**:
  - SQLAlchemy models for `Hospital` and `HospitalResource` with CheckConstraints (`available + reserved <= total`).
  - ResourceType Enum (`ICU_BED`, `GENERAL_BED`, `VENTILATOR`, `OXYGEN_BED`, `TRAUMA_BED`, `OPERATING_ROOM`).
  - Alembic database migration environment and initial migration script.
  - Pydantic request/response validation schemas.
  - CRUD API routes for Hospitals and Hospital Resources under `/api/hospitals`.
  - Database seed script (`backend/scripts/seed.py`) populating sample data.
