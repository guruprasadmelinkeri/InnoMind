import os
import tempfile
from fastapi import APIRouter, status, UploadFile, File, HTTPException
from app.schemas.ai import EmergencyAnalyzeRequest, EmergencyAnalyzeResponse
from app.services.gemini import analyze_emergency_description
from fastapi import Depends
from app.core.auth import require_roles
from app.models.account import Account
from app.services.stt import transcribe

router = APIRouter(prefix="/ai", tags=["AI Emergency Analyzer"])

@router.post("/transcribe-audio", status_code=status.HTTP_200_OK, summary="Transcribe emergency audio")
async def transcribe_emergency_audio(
    file: UploadFile = File(...),
    account: Account = Depends(require_roles("ADMIN", "USER")),
):
    """Transcribe a browser-recorded audio clip using the configured STT service."""
    suffix = os.path.splitext(file.filename or "")[1][:10] or ".webm"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            while chunk := await file.read(1024 * 1024):
                temp_file.write(chunk)
        transcript = transcribe(temp_path)
        if not transcript or not transcript.strip():
            raise HTTPException(status_code=422, detail="No speech was detected. Please record again.")
        return {"transcript": transcript.strip()}
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Audio transcription failed. Please try again.") from exc
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

@router.post(
    "/analyze-emergency",
    response_model=EmergencyAnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze emergency description using Gemini AI"
)
def analyze_emergency(request: EmergencyAnalyzeRequest, account: Account = Depends(require_roles("ADMIN", "USER"))):
    """
    Analyzes natural language emergency description using Google Gemini API.
    Extracts structured severity, patient age, required resources, and clinical reasoning.
    """
    return analyze_emergency_description(request.description)
