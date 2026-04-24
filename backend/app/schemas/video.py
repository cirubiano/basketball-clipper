from datetime import datetime

from pydantic import BaseModel, Field

from app.models.video import VideoStatus


# ── Multipart upload ─────────────────────────────────────────────────────────

class InitUploadRequest(BaseModel):
    """Petición del cliente para iniciar un upload."""
    filename: str = Field(..., min_length=1, max_length=255)
    size: int = Field(..., gt=0, description="Tamaño total del fichero en bytes")
    content_type: str = Field("video/mp4", max_length=100)


class PresignedPart(BaseModel):
    """Una URL pre-firmada para subir una parte concreta."""
    part_number: int = Field(..., ge=1, le=10000)
    url: str


class InitUploadResponse(BaseModel):
    """Plan de upload multipart. El cliente lo usa para subir directo a S3."""
    video_id: int
    upload_id: str
    s3_key: str
    part_size: int = Field(..., description="Tamaño de cada parte en bytes, excepto la última")
    total_parts: int
    urls: list[PresignedPart]


class UploadedPart(BaseModel):
    """Metadata de una parte subida que el cliente reporta al terminar."""
    part_number: int = Field(..., ge=1, le=10000)
    etag: str


class UploadStatusResponse(BaseModel):
    """
    Estado actual del upload — para reanudación. ``uploaded_parts`` lista
    las partes que ya están confirmadas en S3. El cliente debe subir las
    que faltan (``1..total_parts`` \\ ``uploaded_parts[].part_number``).
    """
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
