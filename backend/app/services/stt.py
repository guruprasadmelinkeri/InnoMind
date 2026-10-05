import os
from sarvamai import SarvamAI
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

def _get_stt_api_key():
    """Get STT API key from environment, handling potential quotes."""
    api_key = os.getenv("stt_api_key")
    if api_key:
        # Remove surrounding quotes if present (handles both single and double quotes)
        if api_key.startswith('"') and api_key.endswith('"') and len(api_key) >= 2:
            api_key = api_key[1:-1]
        elif api_key.startswith("'") and api_key.endswith("'") and len(api_key) >= 2:
            api_key = api_key[1:-1]
    return api_key

# Get STT API key
STT_API_KEY = _get_stt_api_key()

# Initialize SarvamAI client
if STT_API_KEY:
    try:
        client = SarvamAI(api_subscription_key=STT_API_KEY)
        logger.info("STT client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize STT client: {e}")
        client = None
else:
    logger.warning("STT API key not found. Speech-to-text functionality will not be available.")
    client = None

def transcribe(audio_file_path: str) -> str:
    """
    Transcribe audio file to text using SarvamAI STT service.

    Args:
        audio_file_path: Path to the audio file

    Returns:
        Transcribed text

    Raises:
        RuntimeError: If STT client is not initialized
    """
    if client is None:
        raise RuntimeError("STT client not initialized. Please check STT API key configuration.")

    with open(audio_file_path, "rb") as audio_file:
        response = client.speech_to_text.transcribe(
            file=audio_file,
            model="saaras:v3",
            mode="transcribe"
        )

    text = response.transcript
    return text