import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Form
from stt import transcribe
router = APIRouter()

UPLOAD_DIR = "uploads"
TRANSCRIPT_DIR = "transcripts"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)


@router.post("")
async def receive_voice(
    file: UploadFile = File(...),
    username: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...)
):
    print("Received:", file.filename)
    print("Username:", username)
    print("Content type:", file.content_type)
    print("Location:", latitude, longitude)

    # Generate unique ID
    unique_id = uuid.uuid4().hex[:12]

    # Example:
    # guruprasad_a83f91c2d441.ogg
    base_name = f"{username}_{unique_id}"

    audio_filename = f"{base_name}.ogg"
    audio_path = os.path.join(UPLOAD_DIR, audio_filename)

    # Save audio
    with open(audio_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    print("Saved:", audio_path)

    # Transcribe
    text = transcribe(audio_path)

    # Save transcript with SAME base name
    transcript_filename = f"{base_name}.txt"
    transcript_path = os.path.join(
        TRANSCRIPT_DIR,
        transcript_filename
    )

    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(text)

    print("Transcript saved:", transcript_path)

    return {
        "staus_code":200,
        "filename": audio_filename,
        "text": text,
        "latitude": latitude,
        "longitude": longitude,
        "username": username,
        "id": unique_id
    }