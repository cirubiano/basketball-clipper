from __future__ import annotations

from datetime import date, datetime
from typing import Optional

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
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, max_length=20)


class ClubPositionResponse(BaseModel):
    id: int
    club_id: int
    name: str
    color: str
    archived_at: Optional[datetime]
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
    date_of_birth: Optional[date] = None
    position_ids: list[int] = Field(default_factory=list)
    photo_url: Optional[str] = Field(None, max_length=512)
    phone: Optional[str] = Field(None, max_length=30)


class PlayerUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    position_ids: Optional[list[int]] = None  # None = no change; [] = clear all
    photo_url: Optional[str] = Field(None, max_length=512)
    phone: Optional[str] = Field(None, max_length=30)


class PlayerResponse(BaseModel):
    id: int
    club_id: int
    first_name: str
    last_name: str
    date_of_birth: Optional[date]
    positions: list[ClubPositionBrief]
    photo_url: Optional[str]
    phone: Optional[str]
    archived_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── RosterEntry ───────────────────────────────────────────────────────────────

class RosterEntryCreate(BaseModel):
    player_id: int
    jersey_number: Optional[int] = Field(None, ge=0, le=99)
    position: Optional[PlayerPosition] = None


class RosterEntryUpdate(BaseModel):
    jersey_number: Optional[int] = Field(None, ge=0, le=99)
    position: Optional[PlayerPosition] = None
    points_per_game: Optional[float] = Field(None, ge=0)
    rebounds_per_game: Optional[float] = Field(None, ge=0)
    assists_per_game: Optional[float] = Field(None, ge=0)
    minutes_per_game: Optional[float] = Field(None, ge=0)


class RosterEntryResponse(BaseModel):
    id: int
    player_id: int
    team_id: int
    season_id: int
    jersey_number: Optional[int]
    position: Optional[PlayerPosition]
    points_per_game: Optional[float]
    rebounds_per_game: Optional[float]
    assists_per_game: Optional[float]
    minutes_per_game: Optional[float]
    archived_at: Optional[datetime]
    created_at: datetime
    # Datos del jugador embebidos para evitar N+1 en la lista de plantilla
    player: PlayerResponse

    model_config = {"from_attributes": True}
