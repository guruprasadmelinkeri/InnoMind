import enum
from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, Boolean, DateTime, ForeignKey, CheckConstraint, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.resource import ResourceType

class EmergencySeverity(str, enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class EmergencyStatus(str, enum.Enum):
    CREATED = "CREATED"
    SEARCHING = "SEARCHING"
    HOSPITAL_SELECTED = "HOSPITAL_SELECTED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    HANDOFF_COMPLETED = "HANDOFF_COMPLETED"
    CANCELLED = "CANCELLED"

class EmergencyCase(Base):
    __tablename__ = "emergency_cases"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    case_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    severity: Mapped[EmergencySeverity] = mapped_column(
        Enum(EmergencySeverity, name="emergencyseverity_enum", native_enum=False),
        nullable=False,
        index=True
    )
    patient_age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pickup_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    pickup_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    status: Mapped[EmergencyStatus] = mapped_column(
        Enum(EmergencyStatus, name="emergencystatus_enum", native_enum=False),
        default=EmergencyStatus.CREATED,
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
    requirements: Mapped[List["EmergencyRequirement"]] = relationship(
        "EmergencyRequirement",
        back_populates="emergency_case",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("pickup_latitude >= -90 AND pickup_latitude <= 90", name="check_pickup_lat_range"),
        CheckConstraint("pickup_longitude >= -180 AND pickup_longitude <= 180", name="check_pickup_lng_range"),
    )

    def __repr__(self) -> str:
        return f"<EmergencyCase(id={self.id}, case_number='{self.case_number}', severity='{self.severity}', status='{self.status}')>"

class EmergencyRequirement(Base):
    __tablename__ = "emergency_requirements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    emergency_case_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("emergency_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    resource_type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType, name="resourcetype_enum", native_enum=False),
        nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    emergency_case: Mapped["EmergencyCase"] = relationship("EmergencyCase", back_populates="requirements")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="check_requirement_quantity_positive"),
    )

    def __repr__(self) -> str:
        return (
            f"<EmergencyRequirement(id={self.id}, emergency_id={self.emergency_case_id}, "
            f"resource='{self.resource_type}', qty={self.quantity})>"
        )
