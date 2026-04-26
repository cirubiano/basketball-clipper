"""
ClubCatalogEntry — entradas del catálogo del club.

drill_id       → la copia publicada (Drill con is_catalog_copy=True).
original_drill_id → referencia al original en la biblioteca del autor;
                    se pone NULL cuando el autor deja el club (RF-124).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Table, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


catalog_entry_tags = Table(
    "catalog_entry_tags",
    Base.metadata,
    Column(
        "entry_id",
        Integer,
        ForeignKey("club_catalog_entries.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        Integer,
        ForeignKey("club_tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class ClubCatalogEntry(Base):
    __tablename__ = "club_catalog_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey("clubs.id"), nullable=False, index=True)
    drill_id: Mapped[int] = mapped_column(ForeignKey("drills.id"), nullable=False)
    original_drill_id: Mapped[int | None] = mapped_column(
        ForeignKey("drills.id", ondelete="SET NULL"), nullable=True
    )
    published_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    drill: Mapped["Drill"] = relationship(  # noqa: F821
        "Drill", foreign_keys=[drill_id], lazy="select"
    )
    original_drill: Mapped["Drill | None"] = relationship(  # noqa: F821
        "Drill", foreign_keys=[original_drill_id], lazy="select"
    )
    publisher: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[published_by], lazy="select"
    )
    tags: Mapped[list["ClubTag"]] = relationship(  # noqa: F821
        "ClubTag", secondary=catalog_entry_tags, lazy="select"
    )
