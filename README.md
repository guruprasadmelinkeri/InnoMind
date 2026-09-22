# MediRoute — Real-Time Emergency Resource Allocator

## 1. Project Overview
**MediRoute** is a prototype real-time emergency resource allocation system designed to assist ambulance dispatchers in identifying suitable hospitals based on available resources, travel times, and data freshness. The platform allows hospitals to confirm or reject incoming requests and manage resource reservations to prevent double-booking.

---

## 2. Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Axios, React Router 7, Lucide React
- **Backend**: Python 3.10+, FastAPI, Pydantic v2, SQLAlchemy, Alembic, Pytest
- **Database**: PostgreSQL (Dockerized or local instance) / SQLite for fast automated test suites

---

## 3. Local Setup & Execution Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- Docker & Docker Compose (or local PostgreSQL instance)

### Step 1: Environment Setup
Ensure environment configuration files are created:
```bash
# Backend environment setup
cp backend/.env.example backend/.env
```

### Step 2: Database Startup
Start the PostgreSQL container:
```bash
docker compose up -d
```

### Step 3: Backend Setup & Server Execution
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

# Seed initial sample hospitals and sample emergency cases
python scripts/seed.py

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```
- Backend API root: `http://localhost:8000`
- Interactive API Docs (Swagger): `http://localhost:8000/docs`
- Health check endpoint: `http://localhost:8000/health`

### Step 4: Frontend Setup & Dev Server
In a separate terminal, navigate to the `frontend` directory:
```bash
cd frontend
npm install
npm run dev
```
- Frontend application will be accessible at: `http://localhost:5173`

---

## 4. Frontend Application Routes & Architecture

### User Interface Routes
| Route | View Description | Key Features |
|---|---|---|
| `/dispatcher` | **Dispatcher Command Center** | Overall KPI metrics (Active cases, Available ICU beds, Pending requests), incident list table, hospital capacity overview |
| `/dispatcher/emergency/new` | **Incident Registration Form** | Form validation, multi-resource requirement selector (ICU Beds, Ventilators, etc.) |
| `/dispatcher/emergency/:id` | **Emergency Detail & Recommendation Engine** | Clinical summary, requirement checklist, live hospital ranking cards with score breakdown and "Why recommended?" reasons |
| `/hospital/:hospitalId` | **Hospital Capacity Dashboard** | Real-time bed & resource inventory, utilization rate, capacity adjustment modal |
| `/hospital/:hospitalId/requests` | **Hospital Allocation Requests** | Pending request alerts, `ACCEPT & RESERVE` button with immediate availability checking state, `REJECT` modal with reason input, HTTP 409 conflict alert modal |

---

## 5. End-to-End Prototype Demo Flow

1. **Create Emergency Incident**:
   - Open `/dispatcher` and click **CREATE EMERGENCY**.
   - Input patient age (e.g. 45), severity (**CRITICAL**), description ("Road accident on Hwy 101"), location coordinates, and select required resources (e.g., 1 ICU Bed, 1 Ventilator).
   - Click **Create Emergency Case**.

2. **Run Allocation Ranking Engine**:
   - On the emergency detail page (`/dispatcher/emergency/1`), click **Find & Rank Hospitals**.
   - Review ranked hospitals with calculated scores (Resource Match, Travel Time, Data Freshness, Trauma Center match) and visible "Why recommended?" bullet points.

3. **Submit Hospital Allocation Request**:
   - On the #1 ranked hospital card (e.g., *CityCare Hospital*), click **REQUEST CONFIRMATION**.
   - The status updates to `PENDING` and a request item is created.

4. **Hospital Staff Confirmation & Atomic Reservation**:
   - Use the top navigation bar hospital selector dropdown to switch to **CityCare Hospital (#1)**.
   - Click **Incoming Requests** or navigate to `/hospital/1/requests`.
   - Locate the pending request and click **ACCEPT & RESERVE**.
   - The UI immediately displays `"Checking current resource availability..."`.
   - The backend performs an atomic SQL transaction checking `available >= required` and locking resources.
   - On success, a toast appears: *"Request accepted! Resources reserved for CityCare Hospital."*

5. **Resource Availability Verification**:
   - Navigate to `/hospital/1` dashboard. Observe that ICU Bed and Ventilator `available` counts have decreased, and `reserved` counts have increased automatically.

6. **Double-Booking & Conflict Handling (HTTP 409)**:
   - If two dispatchers attempt to reserve the last available ventilator simultaneously, the second acceptance request fails atomically.
   - The frontend intercepts the HTTP 409 Conflict response without optimistic state corruption and displays the **Atomic Reservation Failed** error modal.

---

## 6. Automated Test Suites

Run backend automated unit and integration tests covering hospital resources, emergencies, allocation engine, and atomic reservations:
```bash
cd backend
pytest tests/
```

Run frontend production build verification:
```bash
cd frontend
npm run build
```

---

## 7. Current Implementation Status
- **Phase 1 Complete**: Project foundation, FastAPI backend, React Vite frontend, Tailwind styling, `/health` endpoint.
- **Phase 2 Complete**: SQLAlchemy models for `Hospital` & `HospitalResource`, Alembic setup, hospital CRUD APIs.
- **Phase 3 Complete**: `EmergencyCase` & `EmergencyRequirement` models, validation, emergency CRUD APIs.
- **Phase 4 Complete**: Hospital Allocation & Ranking Engine (`app/services/allocation/`), Haversine distance, freshness scoring, recommendation API.
- **Phase 5 Complete**: Atomic Resource Reservation, `AllocationRequest` model, concurrency locking, double-booking protection (HTTP 409).
- **Phase 6 Complete**: Frontend Dashboards (Dispatcher Command Center, Create Incident, Recommendation View, Hospital Capacity Portal, Allocation Requests, Toast notifications, 409 Conflict Modals).
