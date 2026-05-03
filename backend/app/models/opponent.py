from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OpponentTeam(Base):
    __tablename__ = "opponent_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default="#6366f1")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    club: Mapped["Club"] = relationship("Club", lazy="select")  # noqa: F821
    players: Mapped[list["OpponentPlayer"]] = relationship(
        "OpponentPlayer", back_populates="opponent_team",
        cascade="all, delete-orphan", lazy="select"
    )
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match", back_populates="opponent_team", lazy="select"
    )


class OpponentPlayer(Base):
    __tablename__ = "opponent_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    opponent_team_id: Mapped[int] = mapped_column(
        ForeignKey("opponent_teams.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    jersey_number: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[str | None] = mapped_column(String(50))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    opponent_team: Mapped["OpponentTeam"] = relationship(
        "OpponentTeam", back_populates="players"
    )
    match_stats: Mapped[list["OpponentMatchStat"]] = relationship(
        "OpponentMatchStat", back_populates="opponent_player",
        cascade="all, delete-orphan", lazy="select"
    )


class OpponentMatchStat(Base):
    __tablename__ = "opponent_match_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    opponent_player_id: Mapped[int] = mapped_column(
        ForeignKey("opponent_players.id", ondelete="CASCADE"), nullable=False
    )
    points: Mapped[int | None] = mapped_column(Integer)
    minutes: Mapped[int | None] = mapped_column(Integer)
    assists: Mapped[int | None] = mapped_column(Integer)
    defensive_rebounds: Mapped[int | None] = mapped_column(Integer)
    offensive_rebounds: Mapped[int | None] = mapped_column(Integer)
    steals: Mapped[int | None] = mapped_column(Integer)
    turnovers: Mapped[int | None] = mapped_column(Integer)
    fouls: Mapped[int | None] = mapped_column(Integer)
    blocks: Mapped[int | None] = mapped_column(Integer)

    # Relationships
    match: Mapped["Match"] = relationship("Match", back_populates="opponent_stats")  # noqa: F821
    opponent_player: Mapped["OpponentPlayer"] = relationship(
        "OpponentPlayer", back_populates="match_stats"
    )
