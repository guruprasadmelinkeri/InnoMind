from datetime import datetime, timezone
from typing import List, Optional
from decimal import Decimal
from sqlalchemy import String, Numeric, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 6), nullable=True)
    emergency_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="Level 1")
    trauma_center: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Active", nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    resources: Mapped[List["HospitalResource"]] = relationship(
        "HospitalResource",
        back_populates="hospital",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Hospital(id={self.id}, name='{self.name}', status='{self.status}')>"
