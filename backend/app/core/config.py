import os
from typing import List, Union
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "MediRoute API"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://10.10.0.150:5173"
    ]

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres_password"
    POSTGRES_DB: str = "mediroute"
    DATABASE_URL: Union[str, None] = None
    GEMINI_API_KEY: Union[str, None] = None
    AUTO_ARRIVAL_DELAY_SECONDS: int = 30
    AUTH_SECRET_KEY: str = ""
    AUTH_TOKEN_TTL_MINUTES: int = 720
    SMTP_HOST: Union[str, None] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Union[str, None] = None
    SMTP_PASSWORD: Union[str, None] = None
    SMTP_FROM_EMAIL: Union[str, None] = None
    SMTP_USE_TLS: bool = True
    TWILIO_ACCOUNT_SID: Union[str, None] = None
    TWILIO_AUTH_TOKEN: Union[str, None] = None
    TWILIO_FROM_NUMBER: Union[str, None] = None


    @property
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
