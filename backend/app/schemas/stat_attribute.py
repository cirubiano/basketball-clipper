from datetime import datetime

from pydantic import BaseModel, Field

from app.models.stat_attribute import StatAttributeType


class StatAttributeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    type: StatAttributeType = StatAttributeType.count


class StatAttributeUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class StatAttributeResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    team_id: int
    name: str
    type: StatAttributeType
    archived_at: datetime | None
    created_at: datetime


class CustomMatchStatUpsert(BaseModel):
    player_id: int
    stat_attribute_id: int
    value: int = Field(..., ge=0)


class CustomMatchStatResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    match_id: int
    player_id: int
    stat_attribute_id: int
    value: int
    created_at: datetime


class AddStaffRequest(BaseModel):
    """Añadir un staff_member al equipo. El usuario debe ser ClubMember activo."""
    user_id: int
    season_id: int
