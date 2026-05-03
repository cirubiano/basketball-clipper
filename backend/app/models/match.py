import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MatchLocation(str, enum.Enum):
    home = "home"
    away = "away"
    neutral = "neutral"


class MatchStatus(str, enum.Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    finished = "finished"
    cancelled = "cancelled"
    # played is DEPRECATED in PostgreSQL enum -- all records migrated to finished


class MatchVideoLabel(str, enum.Enum):
    scouting = "scouting"
    post_analysis = "post_analysis"
    other = "other"


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    opponent_name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[MatchLocation] = mapped_column(
        Enum(MatchLocation, name="matchlocation"), nullable=False
    )
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="matchstatus"),
        nullable=False,
        server_default="scheduled",
    )
    notes: Mapped[str | None] = mapped_column(Text)
    our_score: Mapped[int | None] = mapped_column(Integer)
    their_score: Mapped[int | None] = mapped_column(Integer)
    competition_id: Mapped[int | None] = mapped_column(
        ForeignKey("competitions.id", ondelete="SET NULL"), nullable=True
    )
    opponent_id: Mapped[int | None] = mapped_column(
        ForeignKey("opponent_teams.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    team: Mapped["Team"] = relationship("Team", lazy="select")  # noqa: F821
    season: Mapped["Season"] = relationship("Season", lazy="select")  # noqa: F821
    competition: Mapped["Competition | None"] = relationship(  # noqa: F821
        "Competition", back_populates="matches", lazy="select"
    )
    opponent_team: Mapped["OpponentTeam | None"] = relationship(  # noqa: F821
        "OpponentTeam", back_populates="matches", lazy="select"
    )
    opponent_stats: Mapped[list["OpponentMatchStat"]] = relationship(  # noqa: F821
        "OpponentMatchStat", back_populates="match",
        cascade="all, delete-orphan", lazy="select"
    )
    match_videos: Mapped[list["MatchVideo"]] = relationship(
        "MatchVideo", back_populates="match", cascade="all, delete-orphan", lazy="select"
    )
    match_players: Mapped[list["MatchPlayer"]] = relationship(
        "MatchPlayer", back_populates="match", cascade="all, delete-orphan", lazy="select"
    )
    match_stats: Mapped[list["MatchStat"]] = relationship(
        "MatchStat", back_populates="match", cascade="all, delete-orphan", lazy="select"
    )


class MatchVideo(Base):
    __tablename__ = "match_videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    video_id: Mapped[int] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[MatchVideoLabel] = mapped_column(
        Enum(MatchVideoLabel, name="matchvideolabel"),
        nullable=False,
        server_default="other",
    )

    match: Mapped["Match"] = relationship("Match", back_populates="match_videos")
    video: Mapped["Video"] = relationship("Video", lazy="select")  # noqa: F821


class MatchPlayer(Base):
    __tablename__ = "match_players"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )

    match: Mapped["Match"] = relationship("Match", back_populates="match_players")
    player: Mapped["Player"] = relationship("Player", lazy="select")  # noqa: F821


class MatchStat(Base):
    __tablename__ = "match_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False
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

    match: Mapped["Match"] = relationship("Match", back_populates="match_stats")
    player: Mapped["Player"] = relationship("Player", lazy="select")  # noqa: F821
