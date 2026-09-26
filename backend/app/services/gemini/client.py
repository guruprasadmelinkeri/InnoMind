import os
from google import genai
from fastapi import HTTPException, status
from app.core.config import settings

def get_genai_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GEMINI_API_KEY environment variable is missing. Please set GEMINI_API_KEY in your environment or backend/.env file."
        )
    return genai.Client(api_key=api_key)
