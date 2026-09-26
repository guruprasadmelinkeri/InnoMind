import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Enum, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base

class AmbulanceStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    OFFLINE = "OFFLINE"

class Ambulance(Base):
    __tablename__ = "ambulances"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    vehicle_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    status: Mapped[AmbulanceStatus] = mapped_column(
        Enum(AmbulanceStatus, name="ambulancestatus_enum", native_enum=False),
        default=AmbulanceStatus.AVAILABLE,
        nullable=False,
        index=True
    )
    current_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

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

    def __repr__(self) -> str:
        return f"<Ambulance(id={self.id}, vehicle_number='{self.vehicle_number}', status='{self.status}')>"
