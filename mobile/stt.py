from sarvamai import SarvamAI
import os
import dotenv
import shutil

dotenv.load_dotenv()
STT_API=os.getenv("stt_api_key")

client = SarvamAI(
    api_subscription_key=STT_API
)

def transcribe(audio_file_path:str):

        with open(audio_file_path, "rb") as audio_file:
            response = client.speech_to_text.transcribe(
                file=audio_file,
                model="saaras:v3",
                mode="transcribe"
            )
        
        text = response.transcript
        text_path = f"{audio_file_path}.txt"
        with open(text_path, "w", encoding="utf-8") as text_file:
            text_file.write(text)
        return text
    