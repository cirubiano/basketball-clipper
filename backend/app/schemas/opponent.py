from datetime import datetime

from pydantic import BaseModel, Field


# ── OpponentPlayer ────────────────────────────────────────────────────────────

class OpponentPlayerCreate(BaseModel):
    jersey_number: int = Field(..., ge=0, le=99)
    name: str | None = Field(None, max_length=255)
    position: str | None = Field(None, max_length=50)


class OpponentPlayerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    jersey_number: int | None = Field(None, ge=0, le=99)
    position: str | None = Field(None, max_length=50)


class OpponentPlayerBulkCreate(BaseModel):
    jersey_numbers: list[int] = Field(..., min_length=1)


class OpponentPlayerResponse(BaseModel):
    id: int
    opponent_team_id: int
    name: str
    jersey_number: int | None
    position: str | None
    archived_at: datetime | None

    model_config = {"from_attributes": True}


# ── OpponentTeam ──────────────────────────────────────────────────────────────

class OpponentTeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    notes: str | None = None
    color: str = Field(default="#6366f1", max_length=20)


class OpponentTeamUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    notes: str | None = None
    color: str | None = Field(None, max_length=20)


class OpponentTeamResponse(BaseModel):
    id: int
    club_id: int
    name: str
    notes: str | None
    color: str
    created_by: int | None
    created_at: datetime
    archived_at: datetime | None
    players: list[OpponentPlayerResponse] = []

    model_config = {"from_attributes": True}


class OpponentTeamSummary(BaseModel):
    """Lightweight version for dropdowns/selects in match forms."""
    id: int
    name: str
    color: str
    archived_at: datetime | None

    model_config = {"from_attributes": True}


# ── OpponentMatchStat ─────────────────────────────────────────────────────────

class OpponentMatchStatUpsert(BaseModel):
    opponent_player_id: int
    points: int | None = None
    minutes: int | None = None
    assists: int | None = None
    defensive_rebounds: int | None = None
    offensive_rebounds: int | None = None
    steals: int | None = None
    turnovers: int | None = None
    fouls: int | None = None
    blocks: int | None = None


class OpponentMatchStatResponse(BaseModel):
    id: int
    match_id: int
    opponent_player_id: int
    opponent_player: OpponentPlayerResponse
    is_starter: bool = False
    points: int | None
    minutes: int | None
    assists: int | None
    defensive_rebounds: int | None
    offensive_rebounds: int | None
    steals: int | None
    turnovers: int | None
    fouls: int | None
    blocks: int | None

    model_config = {"from_attributes": True}
