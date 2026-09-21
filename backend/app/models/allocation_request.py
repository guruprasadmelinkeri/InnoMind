import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

class AllocationRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"

class AllocationRequest(Base):
    __tablename__ = "allocation_requests"

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
    status: Mapped[AllocationRequestStatus] = mapped_column(
        Enum(AllocationRequestStatus, name="allocationrequeststatus_enum", native_enum=False),
        default=AllocationRequestStatus.PENDING,
        nullable=False,
        index=True
    )
    match_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

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

    def __repr__(self) -> str:
        return (
            f"<AllocationRequest(id={self.id}, emergency_id={self.emergency_case_id}, "
            f"hospital_id={self.hospital_id}, status='{self.status}')>"
        )
