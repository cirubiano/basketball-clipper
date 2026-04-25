"""
Schemas Pydantic para Drill, Play y Tag.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.drill import CourtLayoutType, DrillType


# ── Tag ───────────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class TagResponse(BaseModel):
    id: int
    user_id: int
    name: str
    color: str | None
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Drill / Play ───────────────────────────────────────────────────────────────

class DrillCreate(BaseModel):
    type: DrillType
    name: str = Field(..., min_length=1, max_length=255)
    court_layout: CourtLayoutType = CourtLayoutType.half_fiba
    description: str | None = None
    # root_sequence se inicializa en el backend con un nodo raíz vacío
    tag_ids: list[int] = Field(default_factory=list)


class DrillUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    court_layout: CourtLayoutType | None = None
    description: str | None = None
    root_sequence: dict[str, Any] | None = None
    tag_ids: list[int] | None = None  # None = no tocar tags; [] = quitar todos


class DrillResponse(BaseModel):
    id: int
    user_id: int
    type: DrillType
    name: str
    court_layout: CourtLayoutType
    description: str | None
    root_sequence: dict[str, Any]
    parent_id: int | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse]

    model_config = {"from_attributes": True}


class DrillSummaryResponse(BaseModel):
    """Versión compacta sin root_sequence (para listados)."""
    id: int
    user_id: int
    type: DrillType
    name: str
    court_layout: CourtLayoutType
    description: str | None
    parent_id: int | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    tags: list[TagResponse]

    model_config = {"from_attributes": True}
