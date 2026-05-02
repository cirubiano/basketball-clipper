"""
TeamPlaybookEntry — vínculo entre un Drill/Play y un equipo (RF-161).

is_frozen=True indica que el autor salió del equipo (RF-164) y la entrada se
transformó en una copia congelada; drill_id apunta a esa copia.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TeamPlaybookEntry(Base):
    __tablename__ = "team_playbook_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    drill_id: Mapped[int] = mapped_column(ForeignKey("drills.id"), nullable=False)
    added_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Coach annotation visible only to team members
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    drill: Mapped["Drill"] = relationship(  # noqa: F821
        "Drill", foreign_keys=[drill_id], lazy="select"
    )
    added_by_user: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[added_by], lazy="select"
    )
