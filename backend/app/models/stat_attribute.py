"""
TeamStatAttribute — atributos de estadísticas personalizadas por equipo.
CustomMatchStat    — valores de esas estadísticas por jugador y partido.
"""
import enum
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StatAttributeType(enum.StrEnum):
    count = "count"


class TeamStatAttribute(Base):
    __tablename__ = "team_stat_attributes"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[StatAttributeType] = mapped_column(
        Enum(StatAttributeType, name="statattributetype"),
        nullable=False,
        server_default="count",
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    custom_stats: Mapped[list["CustomMatchStat"]] = relationship(
        "CustomMatchStat", back_populates="attribute", cascade="all, delete-orphan"
    )


class CustomMatchStat(Base):
    __tablename__ = "custom_match_stats"

    __table_args__ = (
        UniqueConstraint(
            "match_id", "player_id", "stat_attribute_id",
            name="uq_custom_match_stat",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    stat_attribute_id: Mapped[int] = mapped_column(
        ForeignKey("team_stat_attributes.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    attribute: Mapped["TeamStatAttribute"] = relationship(
        "TeamStatAttribute", back_populates="custom_stats"
    )
