"""
ClubPosition — posiciones dinámicas definidas por el club.

Cada club puede definir sus propias posiciones (ej: Base, Escolta, …).
Un jugador puede tener varias posiciones asignadas (M2M via player_positions).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ── Tabla asociativa M2M player ↔ club_position ───────────────────────────────

player_positions = Table(
    "player_positions",
    Base.metadata,
    Column(
        "player_id",
        Integer,
        ForeignKey("players.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
    Column(
        "position_id",
        Integer,
        ForeignKey("club_positions.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    ),
)


class ClubPosition(Base):
    """
    Posición definida por el club (nombre libre + color hex).
    Las posiciones archivadas no aparecen en la UI pero se mantienen
    en historial para jugadores que las tenían asignadas.
    """
    __tablename__ = "club_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="#6366f1"
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relación inversa: jugadores que tienen esta posición
    players: Mapped[list["Player"]] = relationship(  # noqa: F821
        "Player",
        secondary="player_positions",
        back_populates="positions",
    )
