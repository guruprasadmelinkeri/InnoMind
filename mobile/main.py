from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from voice import router as voice_router

app = FastAPI()

# CORS — allow all origins for local dev (React Native / Expo Go / browser)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount voice router at /voice
app.include_router(voice_router, prefix="/voice")


@app.get("/")
def root():
    return {"message": "Welcome to the main application!"}