"""Schemas para TeamPlaybookEntry."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.drill import DrillSummaryResponse


class AddToPlaybookRequest(BaseModel):
    drill_id: int


class PlaybookEntryResponse(BaseModel):
    id: int
    team_id: int
    drill: DrillSummaryResponse
    added_by: int
    is_frozen: bool
    frozen_at: datetime | None
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
