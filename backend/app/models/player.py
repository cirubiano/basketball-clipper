import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlayerPosition(str, enum.Enum):
    point_guard = "point_guard"        # Base
    shooting_guard = "shooting_guard"  # Escolta
    small_forward = "small_forward"    # Alero
    power_forward = "power_forward"    # Ala-pivot
    center = "center"                  # Pivot


class Player(Base):
    """
    Datos personales del jugador a nivel de club.
    Transversales a temporadas: el jugador pertenece al club,
    sus datos deportivos por equipo van en RosterEntry.
    """
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    # Posición natural del jugador (puede sobreescribirse por equipo en RosterEntry)
    position: Mapped[PlayerPosition | None] = mapped_column(
        Enum(PlayerPosition, name="playerposition")
    )
    photo_url: Mapped[str | None] = mapped_column(String(512))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    club: Mapped["Club"] = relationship("Club", back_populates="players")  # noqa: F821
    roster_entries: Mapped[list["RosterEntry"]] = relationship(  # noqa: F821
        "RosterEntry", back_populates="player", lazy="select"
    )


class RosterEntry(Base):
    """
    Asignación de un jugador a un equipo en una temporada concreta.
    Contiene datos deportivos: dorsal, posición en el equipo y stats básicas.
    """
    __tablename__ = "roster_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    jersey_number: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[PlayerPosition | None] = mapped_column(
        Enum(PlayerPosition, name="playerposition")
    )
    # Estadísticas básicas por temporada (medias por partido)
    points_per_game: Mapped[float | None] = mapped_column(Numeric(5, 1))
    rebounds_per_game: Mapped[float | None] = mapped_column(Numeric(5, 1))
    assists_per_game: Mapped[float | None] = mapped_column(Numeric(5, 1))
    minutes_per_game: Mapped[float | None] = mapped_column(Numeric(5, 1))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    player: Mapped["Player"] = relationship("Player", back_populates="roster_entries")  # noqa: F821
    team: Mapped["Team"] = relationship("Team", back_populates="roster_entries")  # noqa: F821
    season: Mapped["Season"] = relationship("Season", back_populates="roster_entries")  # noqa: F821
