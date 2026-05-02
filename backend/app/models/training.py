import enum
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AbsenceReason(str, enum.Enum):
    injury = "injury"
    personal = "personal"
    sanction = "sanction"
    other = "other"


class Training(Base):
    __tablename__ = "trainings"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=False
    )
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
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
    training_drills: Mapped[list["TrainingDrill"]] = relationship(
        "TrainingDrill",
        back_populates="training",
        cascade="all, delete-orphan",
        order_by="TrainingDrill.position",
        lazy="select",
    )
    training_attendances: Mapped[list["TrainingAttendance"]] = relationship(
        "TrainingAttendance",
        back_populates="training",
        cascade="all, delete-orphan",
        lazy="select",
    )


class TrainingDrill(Base):
    __tablename__ = "training_drills"

    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(
        ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False
    )
    drill_id: Mapped[int] = mapped_column(
        ForeignKey("drills.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)

    training: Mapped["Training"] = relationship("Training", back_populates="training_drills")
    drill: Mapped["Drill"] = relationship("Drill", lazy="select")  # noqa: F821
    groups: Mapped[list["TrainingDrillGroup"]] = relationship(
        "TrainingDrillGroup", back_populates="training_drill", cascade="all, delete-orphan", lazy="select"
    )



# M2M: grupo ↔ jugadores
training_drill_group_players = Table(
    "training_drill_group_players",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("training_drill_groups.id", ondelete="CASCADE"), primary_key=True),
    Column("player_id", Integer, ForeignKey("players.id", ondelete="CASCADE"), primary_key=True),
)


class TrainingDrillGroup(Base):
    """RF-520 — grupo de jugadores asignado a un TrainingDrill (1–4 grupos por ejercicio)."""

    __tablename__ = "training_drill_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    training_drill_id: Mapped[int] = mapped_column(
        ForeignKey("training_drills.id", ondelete="CASCADE"), nullable=False
    )
    group_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–4

    training_drill: Mapped["TrainingDrill"] = relationship(
        "TrainingDrill", back_populates="groups"
    )
    players: Mapped[list["Player"]] = relationship(  # noqa: F821
        "Player", secondary=training_drill_group_players, lazy="select"
    )


class TrainingAttendance(Base):
    __tablename__ = "training_attendances"

    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(
        ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    absence_reason: Mapped[AbsenceReason | None] = mapped_column(
        Enum(AbsenceReason, name="absencereason"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text)

    training: Mapped["Training"] = relationship(
        "Training", back_populates="training_attendances"
    )
    player: Mapped["Player"] = relationship("Player", lazy="select")  # noqa: F821
