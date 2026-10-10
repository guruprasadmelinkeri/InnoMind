from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import api_router
from app.services import ambulance_service, voice
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="MediRoute Real-Time Emergency Resource Allocator API",
    version="0.2.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import WebSocket, WebSocketDisconnect
from app.websocket import manager
from app.core.auth import get_current_account
from app.db.database import SessionLocal

# Include API Router
app.include_router(api_router, prefix="/api")
app.include_router(voice.router, prefix="/voice")


@app.on_event("startup")
def provision_initial_ambulance_fleet() -> None:
    """Add missing demo units without modifying existing fleet records."""
    db = SessionLocal()
    try:
        ambulance_service.ensure_demo_ambulance_fleet(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.websocket("/ws")
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    db = SessionLocal()
    try:
        try:
            account = get_current_account(token, db)
        except Exception:
            await websocket.close(code=4401)
            return
    finally:
        db.close()
    await manager.connect(websocket, {"id": account.id, "role": account.role, "hospital_id": account.hospital_id})
    try:
        while True:
            # Keep connection open and handle incoming messages if any
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "mediroute-api"}
