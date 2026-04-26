"""Schemas para ClubTag y ClubCatalogEntry."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.drill import DrillSummaryResponse


class ClubTagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class ClubTagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class ClubTagResponse(BaseModel):
    id: int
    club_id: int
    name: str
    color: str | None
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PublishToCatalogRequest(BaseModel):
    drill_id: int
    tag_ids: list[int] = Field(default_factory=list)


class UpdateCatalogTagsRequest(BaseModel):
    """Actualiza los tags del club asociados a una entrada del catálogo."""
    tag_ids: list[int] = Field(default_factory=list)


class CatalogEntryResponse(BaseModel):
    id: int
    club_id: int
    drill: DrillSummaryResponse
    original_drill_id: int | None
    published_by: int
    tags: list[ClubTagResponse]
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
