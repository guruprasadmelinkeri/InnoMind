from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    hospital_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
