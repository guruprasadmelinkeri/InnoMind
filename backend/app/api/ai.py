from fastapi import APIRouter, status
from app.schemas.ai import EmergencyAnalyzeRequest, EmergencyAnalyzeResponse
from app.services.gemini import analyze_emergency_description

router = APIRouter(prefix="/ai", tags=["AI Emergency Analyzer"])

@router.post(
    "/analyze-emergency",
    response_model=EmergencyAnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze emergency description using Gemini AI"
)
def analyze_emergency(request: EmergencyAnalyzeRequest):
    """
    Analyzes natural language emergency description using Google Gemini API.
    Extracts structured severity, patient age, required resources, and clinical reasoning.
    """
    return analyze_emergency_description(request.description)
