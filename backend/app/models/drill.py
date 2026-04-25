"""
Drill / Play — ejercicios y jugadas de la biblioteca personal.

Un Drill y un Play comparten el mismo modelo ORM; se distinguen por el campo
`type`. La estructura interna (árbol de secuencias) se almacena como JSON en
`root_sequence`.
"""
from __future__ import annotations

import enum
import uuid as _uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Column,
    func,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class DrillType(str, enum.Enum):
    drill = "drill"
    play = "play"


class CourtLayoutType(str, enum.Enum):
    full_fiba = "full_fiba"
    half_fiba = "half_fiba"
    mini_fiba = "mini_fiba"
    half_mini_fiba = "half_mini_fiba"


# ── Association table — drill ↔ tag ──────────────────────────────────────────

drill_tags = Table(
    "drill_tags",
    Base.metadata,
    Column("drill_id", Integer, ForeignKey("drills.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


# ── Tag ───────────────────────────────────────────────────────────────────────

class Tag(Base):
    """Etiqueta personal de un usuario para clasificar sus drills/plays."""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="tags", lazy="select")  # noqa: F821
    drills: Mapped[list["Drill"]] = relationship(
        "Drill", secondary=drill_tags, back_populates="tags", lazy="select"
    )


# ── Drill / Play ───────────────────────────────────────────────────────────────

def _default_root_sequence() -> dict:
    return {
        "id": str(_uuid.uuid4()),
        "elements": [],
        "branches": [],
        "label": None,
    }


class Drill(Base):
    """
    Ejercicio (Drill) o jugada (Play) — entidad de la biblioteca personal.

    root_sequence: árbol de SequenceNode serializado como JSON (B.1).
    parent_id: referencia al ejercicio padre si es una variante (RF-140).
    """

    __tablename__ = "drills"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[DrillType] = mapped_column(SAEnum(DrillType, name="drilltype"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    court_layout: Mapped[CourtLayoutType] = mapped_column(
        SAEnum(CourtLayoutType, name="courtlayouttype"),
        nullable=False,
        default=CourtLayoutType.half_fiba,
        server_default="half_fiba",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    root_sequence: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=_default_root_sequence
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("drills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # relationships
    user: Mapped["User"] = relationship("User", back_populates="drills", lazy="select")  # noqa: F821
    tags: Mapped[list[Tag]] = relationship(
        Tag, secondary=drill_tags, back_populates="drills", lazy="select"
    )
    parent: Mapped["Drill | None"] = relationship(
        "Drill", remote_side="Drill.id", back_populates="variants", lazy="select"
    )
    variants: Mapped[list["Drill"]] = relationship(
        "Drill", back_populates="parent", lazy="select"
    )
