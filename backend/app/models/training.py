from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


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
    notes: Mapped[str | None] = mapped_column(Text)

    training: Mapped["Training"] = relationship("Training", back_populates="training_drills")
    drill: Mapped["Drill"] = relationship("Drill", lazy="select")  # noqa: F821


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

    training: Mapped["Training"] = relationship(
        "Training", back_populates="training_attendances"
    )
    player: Mapped["Player"] = relationship("Player", lazy="select")  # noqa: F821
