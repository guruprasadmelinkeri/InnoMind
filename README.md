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
   - Open `/dispatcher` in Browser Window 1 and click **CREATE EMERGENCY**.
   - Input patient age (e.g. 45), severity (**CRITICAL**), description ("Road accident on Hwy 101"), location coordinates, and select required resources (e.g., 1 ICU Bed, 1 Ventilator).
   - Click **Create Emergency Case**.

2. **Run Allocation Ranking Engine**:
   - On the emergency detail page (`/dispatcher/emergency/1`), click **Find & Rank Hospitals**.
   - Review ranked hospitals with calculated scores (Resource Match, Travel Time, Data Freshness, Trauma Center match) and visible "Why recommended?" bullet points.

3. **Submit Hospital Allocation Request & Real-Time Broadcast**:
   - On the #1 ranked hospital card (e.g., *CityCare Hospital*), click **REQUEST CONFIRMATION**.
   - The status updates to `PENDING` and an `ALLOCATION_REQUEST_CREATED` event is instantly broadcast over WebSocket.
   - Open Browser Window 2 to `/hospital/1/requests`. The request instantly appears in real-time with a notification sound/toast alert!

4. **Hospital Staff Confirmation & Atomic Reservation**:
   - In Browser Window 2 (Hospital Requests), click **ACCEPT & RESERVE**.
   - The backend atomically locks resources and commits the transaction.
   - Upon successful commit, `ALLOCATION_REQUEST_ACCEPTED`, `RESERVATION_CREATED`, `EMERGENCY_STATUS_UPDATED`, and `RESOURCE_UPDATED` events are broadcast to all connected WebSocket clients.
   - In Browser Window 1 (Dispatcher Dashboard), the request status badge instantly changes to **ACCEPTED** with a green toast notification, without requiring a page refresh.

5. **Resource Availability Verification**:
   - Navigate to `/hospital/1` dashboard. Observe that ICU Bed and Ventilator `available` counts decrease and `reserved` counts increase in real time.

6. **Double-Booking & Conflict Handling (HTTP 409)**:
   - If two dispatchers attempt to reserve the last available ventilator simultaneously, the second acceptance request fails atomically.
   - The frontend intercepts the HTTP 409 Conflict response without optimistic state corruption and displays the **Atomic Reservation Failed** error modal.

---

## 6. WebSocket Real-Time Event System

### Backend Architecture
- **Manager**: `backend/app/websocket/manager.py` using Python standard asyncio/WebSockets with in-memory connection registry and thread-safe/loop-aware `broadcast_event_sync()`.
- **Endpoints**: `ws://localhost:8000/ws` and `ws://localhost:8000/api/ws`.
- **Transaction Safety (`COMMIT -> BROADCAST`)**: Events are triggered strictly inside FastAPI endpoints **AFTER** `db.commit()` succeeds, guaranteeing that failed/rolled-back operations never trigger false updates.

### Event Definitions
| Event Type | Trigger | Payload Summary |
|---|---|---|
| `CONNECTED` | WebSocket Handshake | Connection acknowledgment message |
| `RESOURCE_UPDATED` | Hospital resource edit / reservation creation | `hospital_id`, `resource_type`, `total`, `available`, `reserved`, `last_updated` |
| `ALLOCATION_REQUEST_CREATED` | Dispatcher requests hospital allocation | `request_id`, `emergency_id`, `hospital_id`, `status` (`PENDING`) |
| `ALLOCATION_REQUEST_ACCEPTED` | Hospital accepts request | `request_id`, `emergency_id`, `hospital_id`, `status` (`ACCEPTED`), `responded_at` |
| `ALLOCATION_REQUEST_REJECTED` | Hospital rejects request | `request_id`, `emergency_id`, `hospital_id`, `status` (`REJECTED`), `rejection_reason` |
| `RESERVATION_CREATED` | Atomic reservation finalized | `reservation_id`, `emergency_id`, `hospital_id`, `resource_type`, `quantity`, `expires_at` |
| `EMERGENCY_STATUS_UPDATED` | Status change (e.g. `ASSIGNED`, `EN_ROUTE`) | `emergency_id`, `status`, `assigned_hospital_id` |

### Frontend Integration & Resilience
- **Singleton Service**: `frontend/src/services/websocket.ts` manages reconnection backoff (1s, 2s, 5s).
- **React Hook**: `useWebSocket` hook subscribes components to real-time events.
- **Connection Indicator**: Navigation bar displays live status (`● LIVE`, `● RECONNECTING...`, `● OFFLINE`).

---

## 7. Automated Test Suites

Run backend automated unit, integration, and WebSocket test suites:
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

## 8. Current Implementation Status
- **Phase 1 Complete**: Project foundation, FastAPI backend, React Vite frontend, Tailwind styling, `/health` endpoint.
- **Phase 2 Complete**: SQLAlchemy models for `Hospital` & `HospitalResource`, Alembic setup, hospital CRUD APIs.
- **Phase 3 Complete**: `EmergencyCase` & `EmergencyRequirement` models, validation, emergency CRUD APIs.
- **Phase 4 Complete**: Hospital Allocation & Ranking Engine (`app/services/allocation/`), Haversine distance, freshness scoring, recommendation API.
- **Phase 5 Complete**: Atomic Resource Reservation, `AllocationRequest` model, concurrency locking, double-booking protection (HTTP 409).
- **Phase 6 Complete**: Frontend Dashboards (Dispatcher Command Center, Create Incident, Recommendation View, Hospital Capacity Portal, Allocation Requests, Toast notifications, 409 Conflict Modals).
- **Phase 7 Complete**: Real-Time Updates using WebSockets (`ws://localhost:8000/ws`), `COMMIT -> BROADCAST` event manager, auto-reconnecting frontend socket service, live navigation connection status indicator, and multi-browser dynamic updates without page reloads.
