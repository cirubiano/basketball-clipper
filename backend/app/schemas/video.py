from datetime import datetime

from pydantic import BaseModel

from app.models.video import VideoStatus


class VideoUploadResponse(BaseModel):
    id: int
    status: VideoStatus
    message: str


class VideoStatusResponse(BaseModel):
    id: int
    status: VideoStatus
    progress: int | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
