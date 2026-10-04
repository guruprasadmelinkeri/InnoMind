from fastapi import FastAPI, UploadFile, File,Form,APIRouter
import os
import shutil
from stt import transcribe
import asyncio
from bot import start_bot
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):

    bot_task = asyncio.create_task(start_bot())

    print("FastAPI started")

    yield

    # Runs when FastAPI shuts down
    bot_task.cancel()

    try:
        await bot_task
    except asyncio.CancelledError:
        pass
router=APIRouter(lifespan=lifespan,
    prefix="/voice", 
    tags=["voice"]    
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)



@router.post("")
#hndle the recived location coordinates
async def receive_voice(file: UploadFile = File(...),latitude: float = Form(...),
    longitude: float = Form(...)
):

    print("Received:", file.filename)
    print("Content type:", file.content_type)

    # Save uploaded audio temporarily
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    print("Saved temporarily:", file_path)
    

    
    text=transcribe(file_path)
    
    return {
        "filename": file.filename,
        "text": text,
        "latitude":latitude,
        "longitude":longitude
    }

