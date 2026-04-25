from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    club: Mapped["Club"] = relationship("Club", back_populates="teams")  # noqa: F821
    season: Mapped["Season"] = relationship("Season", back_populates="teams")  # noqa: F821
    profiles: Mapped[list["Profile"]] = relationship(  # noqa: F821
        "Profile", back_populates="team", lazy="select"
    )
    videos: Mapped[list["Video"]] = relationship(  # noqa: F821
        "Video", back_populates="team", lazy="select"
    )
    roster_entries: Mapped[list["RosterEntry"]] = relationship(  # noqa: F821
        "RosterEntry", back_populates="team", lazy="select"
    )
