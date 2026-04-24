from datetime import datetime

from pydantic import BaseModel, Field

from app.models.video import VideoStatus


# ── Multipart upload ─────────────────────────────────────────────────────────

class InitUploadRequest(BaseModel):
    """Petición del cliente para iniciar un upload."""
    title: str = Field(..., min_length=1, max_length=255, description="Etiqueta legible (ej. 'vs Estudiantes 12-may')")
    filename: str = Field(..., min_length=1, max_length=255)
    size: int = Field(..., gt=0, description="Tamaño total del fichero en bytes")
    content_type: str = Field("video/mp4", max_length=100)


class PresignedPart(BaseModel):
    part_number: int = Field(..., ge=1, le=10000)
    url: str


class InitUploadResponse(BaseModel):
    video_id: int
    upload_id: str
    s3_key: str
    part_size: int
    total_parts: int
    urls: list[PresignedPart]


class UploadedPart(BaseModel):
    part_number: int = Field(..., ge=1, le=10000)
    etag: str


class UploadStatusResponse(BaseModel):
    video_id: int
    upload_id: str | None
    s3_key: str
    status: VideoStatus
    uploaded_parts: list[UploadedPart]


class CompleteUploadRequest(BaseModel):
    parts: list[UploadedPart] = Field(..., min_length=1, max_length=10000)


# ── Video lifecycle responses ────────────────────────────────────────────────

class VideoStatusResponse(BaseModel):
    id: int
    status: VideoStatus
    progress: int | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoListItem(BaseModel):
    """Resumen de un vídeo para el listado en /videos."""
    id: int
    title: str | None
    filename: str
    status: VideoStatus
    error_message: str | None
    clips_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
