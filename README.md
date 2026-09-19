# MediRoute — Real-Time Emergency Resource Allocator

## 1. Project Overview
**MediRoute** is a prototype real-time emergency resource allocation system designed to assist ambulance dispatchers in identifying suitable hospitals based on available resources, travel times, and data freshness. The platform allows hospitals to confirm or reject incoming requests and manage resource reservations to prevent double-booking.

## 2. Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Axios
- **Backend**: Python 3.10+, FastAPI, Pydantic, SQLAlchemy
- **Database**: PostgreSQL (Dockerized)
- **Containerization**: Docker Compose (Database)

## 3. Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- Docker & Docker Compose (optional for local DB container)

### Step 1: Clone & Environment Setup
Ensure environment configuration files are created:
```bash
# Backend environment setup
cp backend/.env.example backend/.env
```

### Step 2: Database Setup (Optional via Docker)
Start the PostgreSQL container:
```bash
docker-compose up -d
```

### Step 3: Backend Setup & Execution
Navigate to the `backend` directory:
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend API will be accessible at: `http://localhost:8000`
Health check endpoint: `http://localhost:8000/health`

### Step 4: Frontend Setup & Execution
In a new terminal, navigate to the `frontend` directory:
```bash
cd frontend
npm install
npm run dev
```
Frontend application will be accessible at: `http://localhost:5173`

## 4. Current Implementation Status
- **Phase 1 Complete**:
  - Initial project structure created (`frontend/`, `backend/`, `docker-compose.yml`).
  - FastAPI backend configured with CORS and GET `/health` endpoint.
  - SQLAlchemy PostgreSQL configuration set up with environment settings.
  - React + TypeScript + Vite frontend with Tailwind CSS integrated.
  - Axios service module configured for backend health check display.
  - PostgreSQL container configured via Docker Compose.
