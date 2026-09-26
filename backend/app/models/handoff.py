import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

class HandoffStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"

class Handoff(Base):
    __tablename__ = "handoffs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    emergency_case_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("emergency_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    hospital_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    ambulance_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("ambulances.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    arrival_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    handoff_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    received_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[HandoffStatus] = mapped_column(
        Enum(HandoffStatus, name="handoffstatus_enum", native_enum=False),
        default=HandoffStatus.PENDING,
        nullable=False,
        index=True
    )

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
    emergency_case: Mapped["EmergencyCase"] = relationship("EmergencyCase")
    hospital: Mapped["Hospital"] = relationship("Hospital")
    ambulance: Mapped["Ambulance"] = relationship("Ambulance")

    def __repr__(self) -> str:
        return (
            f"<Handoff(id={self.id}, emergency_id={self.emergency_case_id}, "
            f"hospital_id={self.hospital_id}, ambulance_id={self.ambulance_id}, status='{self.status}')>"
        )
