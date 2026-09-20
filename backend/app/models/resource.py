import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, CheckConstraint, UniqueConstraint, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

class ResourceType(str, enum.Enum):
    ICU_BED = "ICU_BED"
    GENERAL_BED = "GENERAL_BED"
    VENTILATOR = "VENTILATOR"
    OXYGEN_BED = "OXYGEN_BED"
    TRAUMA_BED = "TRAUMA_BED"
    OPERATING_ROOM = "OPERATING_ROOM"

class HospitalResource(Base):
    __tablename__ = "hospital_resources"

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    hospital_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hospitals.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    resource_type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType, name="resourcetype_enum", native_enum=False),
        nullable=False,
        index=True
    )
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
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
    hospital: Mapped["Hospital"] = relationship("Hospital", back_populates="resources")

    __table_args__ = (
        CheckConstraint("total >= 0", name="check_total_non_negative"),
        CheckConstraint("available >= 0", name="check_available_non_negative"),
        CheckConstraint("reserved >= 0", name="check_reserved_non_negative"),
        CheckConstraint("available + reserved <= total", name="check_available_plus_reserved_lte_total"),
        UniqueConstraint("hospital_id", "resource_type", name="uq_hospital_resource_type"),
    )

    def __repr__(self) -> str:
        return (
            f"<HospitalResource(id={self.id}, hospital_id={self.hospital_id}, "
            f"type='{self.resource_type}', total={self.total}, avail={self.available}, res={self.reserved})>"
        )
