from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ClockType = Literal["stopped", "running"]


class CompetitionCreate(BaseModel):
    season_id: int
    name: str = Field(..., min_length=1, max_length=255)
    is_default: bool = False
    quarters: int = Field(default=4, ge=1, le=8)
    minutes_per_quarter: int = Field(default=10, ge=1, le=60)
    players_on_court: int = Field(default=5, ge=1, le=10)
    bench_size: int = Field(default=7, ge=0, le=20)
    clock_type: ClockType = "stopped"


class CompetitionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    is_default: bool | None = None
    quarters: int | None = Field(None, ge=1, le=8)
    minutes_per_quarter: int | None = Field(None, ge=1, le=60)
    players_on_court: int | None = Field(None, ge=1, le=10)
    bench_size: int | None = Field(None, ge=0, le=20)
    clock_type: ClockType | None = None


class CompetitionResponse(BaseModel):
    id: int
    team_id: int
    season_id: int
    name: str
    is_default: bool
    quarters: int
    minutes_per_quarter: int
    players_on_court: int
    bench_size: int
    clock_type: str
    created_by: int | None
    created_at: datetime
    archived_at: datetime | None
    match_count: int = 0

    model_config = {"from_attributes": True}
