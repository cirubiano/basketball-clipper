from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.stat_attribute import StatAttributeType


class StatAttributeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    short_name: Optional[str] = Field(None, max_length=10)
    description: Optional[str] = Field(None, max_length=300)
    color: Optional[str] = Field(None, max_length=20)
    type: StatAttributeType = StatAttributeType.count


class StatAttributeUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    short_name: Optional[str] = Field(None, max_length=10)
    description: Optional[str] = Field(None, max_length=300)
    color: Optional[str] = Field(None, max_length=20)


class StatAttributeResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    team_id: int
    name: str
    short_name: Optional[str]
    description: Optional[str]
    color: Optional[str]
    type: StatAttributeType
    archived_at: Optional[datetime]
    created_at: datetime


class CustomMatchStatUpsert(BaseModel):
    """Exactamente uno de player_id / opponent_player_id debe estar presente."""
    stat_attribute_id: int
    player_id: Optional[int] = None
    opponent_player_id: Optional[int] = None
    value: int = Field(..., ge=0)

    @model_validator(mode="after")
    def exactly_one_player(self) -> "CustomMatchStatUpsert":
        has_home = self.player_id is not None
        has_rival = self.opponent_player_id is not None
        if has_home == has_rival:
            raise ValueError("Exactly one of player_id or opponent_player_id must be provided")
        return self


class CustomMatchStatResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    match_id: int
    stat_attribute_id: int
    player_id: Optional[int]
    opponent_player_id: Optional[int]
    value: int
    created_at: datetime


class AddStaffRequest(BaseModel):
    """Añadir un staff_member al equipo. El usuario debe ser ClubMember activo."""
    user_id: int
    season_id: int
