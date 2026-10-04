import os
import httpx
import asyncio

from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Application,
    MessageHandler,
    ContextTypes,
    filters,
)


BOT_TOKEN = os.getenv("TELEGRAM_BOT_API")
FASTAPI_URL = "http://localhost:8000/voice"



# Temporary storage for user locations
pending_voice = {}


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE):

    user_id = update.effective_user.id

    voice = update.message.voice

    telegram_file = await context.bot.get_file(
        voice.file_id
    )

    audio_bytes = await telegram_file.download_as_bytearray()

    # Remember the audio until the user gives location
    pending_voice[user_id] = bytes(audio_bytes)

    # Ask for location
    keyboard = [
        [
            KeyboardButton(
                "📍 Share Location",
                request_location=True
            )
        ]
    ]

    reply_markup = ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,
        one_time_keyboard=True
    )

    await update.message.reply_text(
        "🎤 Voice received.\n\n"
        "Now share your location:",
        reply_markup=reply_markup
    )


async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):

    user_id = update.effective_user.id

    # Check whether we have a voice waiting
    if user_id not in pending_voice:
        await update.message.reply_text(
            "Please send a voice message first."
        )
        return

    location = update.message.location

    latitude = location.latitude
    longitude = location.longitude

    audio_bytes = pending_voice[user_id]

    # Send audio + location to FastAPI
    async with httpx.AsyncClient() as client:

        response = await client.post(
            FASTAPI_URL,
            files={
                "file": (
                    "voice.ogg",
                    audio_bytes,
                    "audio/ogg"
                )
            },
            data={
                "latitude": latitude,
                "longitude": longitude
            }
        )

    data = response.json()

    
    # Remove pending audio
    del pending_voice[user_id]

    # Send transcript to Telegram
    await update.message.reply_text(
        f"📝 {data}"
    )
    print(data)


async def start_bot():

    app = Application.builder().token(BOT_TOKEN).build()

    # Voice
    app.add_handler(
        MessageHandler(
            filters.VOICE,
            handle_voice
        )
    )

    # Location
    app.add_handler(
        MessageHandler(
            filters.LOCATION,
            handle_location
        )
    )

    await app.initialize()
    await app.start()
    await app.updater.start_polling()

    print("Telegram bot started")

    try:
        while True:
            await asyncio.sleep(3600)

    finally:
        await app.updater.stop()
        await app.stop()
        await app.shutdown()