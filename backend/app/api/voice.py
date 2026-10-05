import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from app.services.stt import transcribe
from app.services.voice_emergency import process_voice_to_emergency
from app.db.database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/voice", tags=["Voice Processing"])

# Directory for temporary file storage
UPLOAD_DIR = "voice_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload-and-process", status_code=status.HTTP_201_CREATED)
async def upload_and_process_voice(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    username: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Handle voice upload, transcription, and automated emergency processing.

    This endpoint:
    1. Receives an audio file upload
    2. Saves it temporarily
    3. Transcribes it using STT service
    4. Processes the transcript through the voice-to-emergency automation pipeline
    5. Returns the automation results

    This consolidates voice processing into the backend for a single server solution.
    """
    # Generate unique ID for file naming
    unique_id = uuid.uuid4().hex[:12]
    base_name = f"{username}_{unique_id}"

    # Define file paths
    audio_filename = f"{base_name}.ogg"
    audio_path = os.path.join(UPLOAD_DIR, audio_filename)

    try:
        # Save uploaded audio file
        with open(audio_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Transcribe audio to text
        try:
            text = transcribe(audio_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Speech-to-text transcription failed: {str(e)}"
            )

        # Process through voice-to-emergency automation pipeline
        try:
            automation_result = process_voice_to_emergency(
                db=db,
                transcript=text,
                latitude=latitude,
                longitude=longitude,
                username=username
            )

            # Return results including transcription and automation details
            return {
                "status_code": 200,
                "filename": audio_filename,
                "text": text,
                "latitude": latitude,
                "longitude": longitude,
                "username": username,
                "id": unique_id,
                "automation": automation_result
            }
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Voice-to-emergency processing failed: {str(e)}"
            )

    finally:
        # Clean up: remove the temporary audio file
        # Note: In a production system, you might want to keep files for a certain period
        # or implement a more sophisticated cleanup strategy
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError:
                pass  # Ignore errors during cleanup