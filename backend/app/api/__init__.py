from fastapi import APIRouter
from app.api.hospitals import router as hospitals_router

api_router = APIRouter(prefix="/api")
api_router.include_router(hospitals_router)
