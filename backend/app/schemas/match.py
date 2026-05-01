from datetime import datetime

from pydantic import BaseModel

from app.models.match import MatchLocation, MatchStatus, MatchVideoLabel


class MatchVideoResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    match_id: int
    video_id: int
    label: MatchVideoLabel
    video_title: str | None = None
    video_s3_key: str | None = None


class MatchPlayerResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    match_id: int
    player_id: int
    player_first_name: str | None = None
    player_last_name: str | None = None


class MatchStatResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    match_id: int
    player_id: int
    points: int | None
    minutes: int | None
    assists: int | None
    defensive_rebounds: int | None
    offensive_rebounds: int | None
    steals: int | None
    turnovers: int | None
    fouls: int | None


class MatchResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    team_id: int
    season_id: int
    date: datetime
    opponent_name: str
    location: MatchLocation
    status: MatchStatus
    notes: str | None
    our_score: int | None = None
    their_score: int | None = None
    created_by: int | None
    created_at: datetime
    archived_at: datetime | None
    match_videos: list[MatchVideoResponse] = []
    match_players: list[MatchPlayerResponse] = []
    match_stats: list[MatchStatResponse] = []


class MatchCreate(BaseModel):
    opponent_name: str
    date: datetime
    location: MatchLocation
    season_id: int
    status: MatchStatus = MatchStatus.scheduled
    notes: str | None = None


class MatchUpdate(BaseModel):
    opponent_name: str | None = None
    date: datetime | None = None
    location: MatchLocation | None = None
    status: MatchStatus | None = None
    notes: str | None = None
    our_score: int | None = None
    their_score: int | None = None


class MatchVideoAdd(BaseModel):
    video_id: int
    label: MatchVideoLabel = MatchVideoLabel.other


class MatchStatUpsert(BaseModel):
    player_id: int
    points: int | None = None
    minutes: int | None = None
    assists: int | None = None
    defensive_rebounds: int | None = None
    offensive_rebounds: int | None = None
    steals: int | None = None
    turnovers: int | None = None
    fouls: int | None = None
