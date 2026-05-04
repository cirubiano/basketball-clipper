from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.player import PlayerPosition

# ── Club Position (used inline in PlayerResponse) ─────────────────────────────

class ClubPositionBrief(BaseModel):
    """Posición del club embebida en la respuesta del jugador."""
    id: int
    name: str
    color: str

    model_config = {"from_attributes": True}


class ClubPositionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6366f1", max_length=20)


class ClubPositionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, max_length=20)


class ClubPositionResponse(BaseModel):
    id: int
    club_id: int
    name: str
    color: str
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Photo upload ───────────────────────────────────────────────────────────────

class PhotoUploadRequest(BaseModel):
    filename: str = Field(..., max_length=255)
    content_type: str = Field(..., max_length=100)


class PhotoUploadResponse(BaseModel):
    upload_url: str
    photo_url: str


# ── Player ────────────────────────────────────────────────────────────────────

class PlayerCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: date | None = None
    position_ids: list[int] = Field(default_factory=list)
    photo_url: str | None = Field(None, max_length=512)
    phone: str | None = Field(None, max_length=30)


class PlayerUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    date_of_birth: date | None = None
    position_ids: list[int] | None = None  # None = no change; [] = clear all
    photo_url: str | None = Field(None, max_length=512)
    phone: str | None = Field(None, max_length=30)


class PlayerResponse(BaseModel):
    id: int
    club_id: int
    first_name: str
    last_name: str
    date_of_birth: date | None
    positions: list[ClubPositionBrief]
    photo_url: str | None
    phone: str | None
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── RosterEntry ───────────────────────────────────────────────────────────────

class RosterEntryCreate(BaseModel):
    player_id: int
    jersey_number: int = Field(..., ge=0, le=99)
    position: PlayerPosition | None = None


class RosterEntryUpdate(BaseModel):
    jersey_number: int | None = Field(None, ge=0, le=99)
    position: PlayerPosition | None = None
    points_per_game: float | None = Field(None, ge=0)
    rebounds_per_game: float | None = Field(None, ge=0)
    assists_per_game: float | None = Field(None, ge=0)
    minutes_per_game: float | None = Field(None, ge=0)


class RosterEntryResponse(BaseModel):
    id: int
    player_id: int
    team_id: int
    season_id: int
    jersey_number: int | None
    position: PlayerPosition | None
    points_per_game: float | None
    rebounds_per_game: float | None
    assists_per_game: float | None
    minutes_per_game: float | None
    archived_at: datetime | None
    created_at: datetime
    # Datos del jugador embebidos para evitar N+1 en la lista de plantilla
    player: PlayerResponse

    model_config = {"from_attributes": True}


# ── CSV Import ─────────────────────────────────────────────────────────────────

class CsvImportResponse(BaseModel):
    created: int
    skipped: int
    errors: list[dict[str, Any]]
