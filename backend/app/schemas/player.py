from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.player import PlayerPosition


# ── Player ────────────────────────────────────────────────────────────────────

class PlayerCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    position: Optional[PlayerPosition] = None
    photo_url: Optional[str] = Field(None, max_length=512)


class PlayerUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    position: Optional[PlayerPosition] = None
    photo_url: Optional[str] = Field(None, max_length=512)


class PlayerResponse(BaseModel):
    id: int
    club_id: int
    first_name: str
    last_name: str
    date_of_birth: Optional[date]
    position: Optional[PlayerPosition]
    photo_url: Optional[str]
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
