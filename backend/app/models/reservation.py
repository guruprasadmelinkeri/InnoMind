import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, DateTime, ForeignKey, CheckConstraint, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

class ReservationStatus(str, enum.Enum):
    HELD = "HELD"
    CONFIRMED = "CONFIRMED"
    RELEASED = "RELEASED"
    CONSUMED = "CONSUMED"
    EXPIRED = "EXPIRED"

class Reservation(Base):
    __tablename__ = "reservations"

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
    resource_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hospital_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus, name="reservationstatus_enum", native_enum=False),
        default=ReservationStatus.CONFIRMED,
        nullable=False,
        index=True
    )

    reserved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
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
    resource: Mapped["HospitalResource"] = relationship("HospitalResource")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="check_reservation_quantity_positive"),
    )

    def __repr__(self) -> str:
        return (
            f"<Reservation(id={self.id}, emergency_id={self.emergency_case_id}, "
            f"hospital_id={self.hospital_id}, resource_id={self.resource_id}, qty={self.quantity})>"
        )
