import asyncio
import logging
from typing import Dict, Any
from fastapi import WebSocket
from app.db.database import SessionLocal
from app.models.emergency import EmergencyCase

logger = logging.getLogger(__name__)

class ConnectionManager:
    """In-memory WebSocket Connection Manager for real-time broadcast events."""
    
    def __init__(self):
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, account: Dict[str, Any]):
        await websocket.accept()
        self.active_connections[websocket] = account
        logger.info(f"WebSocket connected. Total active connections: {len(self.active_connections)}")
        
        # Send CONNECTED handshake event
        try:
            await websocket.send_json({
                "event": "CONNECTED",
                "message": "Real-time WebSocket connection established"
            })
        except Exception as e:
            logger.warning(f"Failed to send CONNECTED handshake: {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.pop(websocket)
            logger.info(f"WebSocket disconnected. Remaining active connections: {len(self.active_connections)}")

    async def broadcast(self, event: str, data: Dict[str, Any]):
        """Broadcast event to all connected WebSocket clients."""
        payload = {
            "event": event,
            "data": data
        }
        stale_connections = []
        for connection, account in list(self.active_connections.items()):
            try:
                if account["role"] == "HOSPITAL" and data.get("hospital_id") != account.get("hospital_id"):
                    continue
                if account["role"] == "USER":
                    emergency_id = data.get("emergency_id")
                    if not emergency_id:
                        continue
                    db = SessionLocal()
                    try:
                        owned = db.query(EmergencyCase.id).filter(EmergencyCase.id == emergency_id, EmergencyCase.created_by_account_id == account["id"]).first()
                    finally:
                        db.close()
                    if not owned:
                        continue
                await connection.send_json(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                stale_connections.append(connection)

        # Cleanup disconnected clients
        for stale in stale_connections:
            self.disconnect(stale)

manager = ConnectionManager()

def broadcast_event_sync(event: str, data: Dict[str, Any]):
    """
    Helper function to trigger WebSocket broadcasts from synchronous database service functions.
    Ensures events are dispatched only after DB operations commit.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(event, data))
    except RuntimeError:
        # If called outside a running event loop (e.g. background threads or sync tests), run via asyncio
        try:
            asyncio.run(manager.broadcast(event, data))
        except Exception as e:
            logger.warning(f"Could not broadcast event '{event}': {e}")
