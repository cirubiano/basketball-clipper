from datetime import datetime

from pydantic import BaseModel


class ClipResponse(BaseModel):
    id: int
    video_id: int
    start_time: float
    end_time: float
    team: str | None
    s3_key: str
    url: str  # pre-signed S3 GET URL, valid for 1 hour
    duration: float
    created_at: datetime

    model_config = {"from_attributes": True}
