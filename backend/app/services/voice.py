import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from app.services.stt import transcribe
from app.services.gemini.emergency_analyzer import analyze_emergency_description
from app.services.reservation import create_allocation_request
from app.services import emergency_service
from app.db.database import get_db
from sqlalchemy.orm import Session
from fastapi import Depends
from app.schemas.emergency import EmergencyCaseCreate, EmergencyRequirementCreate
from app.models.resource import ResourceType

router = APIRouter()

UPLOAD_DIR = "voice_uploads"
TRANSCRIPT_DIR = "transcripts"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TRANSCRIPT_DIR, exist_ok=True)


@router.post("")
async def process_voice_request(
    # Option 1: Voice file upload (new preferred method)
    file: UploadFile | None = File(None),
    # Option 2: Direct transcript submission (backward compatibility with existing mobile app)
    transcript: str | None = Form(None),
    # Common fields
    username: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    db: Session = Depends(get_db)
):
    """
    Unified voice processing endpoint that handles:
    1. Voice file upload -> transcribe -> AI analysis -> emergency creation -> allocation request
    2. Direct transcript submission -> AI analysis -> emergency creation -> allocation request

    This maintains backward compatibility with existing mobile app while enabling
    a single backend server solution for voice-to-emergency automation.
    """
    print("Received voice request:")
    print(f"  Username: {username}")
    print(f"  Location: ({latitude}, {longitude})")
    print(f"  Has file: {file is not None}")
    print(f"  Has transcript: {transcript is not None}")

    # Initialize variables
    audio_filename = None
    audio_path = None
    final_transcript = None
    unique_id = uuid.uuid4().hex[:12]
    base_name = f"{username}_{unique_id}"

    try:
        # Case 1: Voice file upload provided (new method)
        if file is not None:
            print(f"Processing voice file: {file.filename}")

            # Save uploaded audio file
            audio_filename = f"{base_name}.ogg"
            audio_path = os.path.join(UPLOAD_DIR, audio_filename)

            with open(audio_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            print(f"Saved audio to: {audio_path}")

            # Transcribe audio to text
            final_transcript = transcribe(audio_path)
            print(f"Transcribed text: {final_transcript[:100]}...")

        # Case 2: Direct transcript submission (backward compatibility)
        elif transcript is not None:
            print(f"Processing direct transcript: {transcript[:100]}...")
            final_transcript = transcript

        # Case 3: Neither provided
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either voice file or transcript must be provided"
            )

        # === AUTOMATION PIPELINE (shared by both paths) ===
        # Step 1: AI analysis (reuse existing Gemini service)
        analysis = analyze_emergency_description(final_transcript)

        # Step 2: Create emergency case
        emergency_in = EmergencyCaseCreate(
            severity=analysis["severity"],
            patient_age=analysis["patient_age"],
            description=analysis["summary"],
            pickup_latitude=latitude,
            pickup_longitude=longitude,
            requirements=[
                EmergencyRequirementCreate(
                    resource_type=ResourceType[rt["resource_type"]],
                    quantity=rt["quantity"]
                )
                for rt in analysis["required_resources"]
            ]
        )
        emergency = emergency_service.create_emergency_case(db, emergency_in)

        # Step 3: Get hospital recommendations (reuse existing ranking)
        from app.services.allocation import rank_hospitals
        ranking_result = rank_hospitals(db, emergency.id)

        if not ranking_result["recommendations"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No suitable hospitals found for this emergency"
            )

        # Step 4: Create allocation request to top-ranked hospital
        top_hospital_info = ranking_result["recommendations"][0]
        top_hospital_id = top_hospital_info["hospital_id"]
        allocation_request = create_allocation_request(
            db,
            emergency_id=emergency.id,
            hospital_id=top_hospital_id
        )

        automation_result = {
            "emergency_id": emergency.id,
            "allocation_request_id": allocation_request.id,
            "hospital_id": top_hospital_id,
            "status": allocation_request.status.value,
            # Include additional info from ranking for debugging/frontend
            "hospital_name": top_hospital_info["hospital_name"],
            "final_score": top_hospital_info["final_score"],
            "travel_minutes": top_hospital_info["estimated_travel_minutes"],
            "total_hospitals_evaluated": len(ranking_result["recommendations"]) + len(ranking_result["ineligible_hospitals"])
        }

        # Save transcript with SAME base name (for both paths)
        transcript_filename = f"{base_name}.txt"
        transcript_path = os.path.join(
            TRANSCRIPT_DIR,
            transcript_filename
        )

        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(final_transcript)

        print(f"Transcript saved to: {transcript_path}")

        # Prepare response
        response = {
            "status_code": 200,
            "text": final_transcript,
            "latitude": latitude,
            "longitude": longitude,
            "username": username,
            "id": unique_id,
            "automation": automation_result
        }

        # Include filename if we processed a voice file
        if audio_filename:
            response["filename"] = audio_filename

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"Voice processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Voice processing failed: {str(e)}"
        )
    finally:
        # Clean up: remove the temporary audio file if we saved one
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"Cleaned up audio file: {audio_path}")
            except OSError as e:
                print(f"Warning: Failed to clean up audio file {audio_path}: {e}")