from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Competition(Base):
    __tablename__ = "competitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Format fields (FIBA defaults)
    quarters: Mapped[int] = mapped_column(Integer, nullable=False, server_default="4")
    minutes_per_quarter: Mapped[int] = mapped_column(Integer, nullable=False, server_default="10")
    players_on_court: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    bench_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default="7")
    clock_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="stopped")

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    team: Mapped["Team"] = relationship("Team", lazy="select")  # noqa: F821
    season: Mapped["Season"] = relationship("Season", lazy="select")  # noqa: F821
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match", back_populates="competition", lazy="select"
    )
