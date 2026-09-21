from fastapi import APIRouter
from app.api.hospitals import router as hospitals_router
from app.api.emergencies import router as emergencies_router
from app.api.allocation_requests import router as allocation_requests_router

api_router = APIRouter(prefix="/api")
api_router.include_router(hospitals_router)
api_router.include_router(emergencies_router)
api_router.include_router(allocation_requests_router)
