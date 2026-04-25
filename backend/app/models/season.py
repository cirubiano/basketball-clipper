import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SeasonStatus(str, enum.Enum):
    future = "future"
    active = "active"
    archived = "archived"


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[SeasonStatus] = mapped_column(
        Enum(SeasonStatus, name="seasonstatus"),
        default=SeasonStatus.future,
        server_default=SeasonStatus.future.value,
        nullable=False,
    )
    starts_at: Mapped[date | None] = mapped_column(Date)
    ends_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    club: Mapped["Club"] = relationship("Club", back_populates="seasons")  # noqa: F821
    teams: Mapped[list["Team"]] = relationship(  # noqa: F821
        "Team", back_populates="season", lazy="select"
    )
    profiles: Mapped[list["Profile"]] = relationship(  # noqa: F821
        "Profile", back_populates="season", lazy="select"
    )
    roster_entries: Mapped[list["RosterEntry"]] = relationship(  # noqa: F821
        "RosterEntry", back_populates="season", lazy="select"
    )
