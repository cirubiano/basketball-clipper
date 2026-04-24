import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VideoStatus(str, enum.Enum):
    """
    Estado del vídeo a lo largo del pipeline.

    Flujo normal:
      uploading → pending → validating → processing → completed
    Flujos de error:
      uploading → (abort) → [fila borrada o marcada como error]
      validating → invalid (no es un partido de baloncesto)
      processing → error (fallo del detector/cutter)
    """
    uploading = "uploading"
    pending = "pending"
    validating = "validating"
    processing = "processing"
    completed = "completed"
    invalid = "invalid"
    error = "error"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[VideoStatus] = mapped_column(
        Enum(VideoStatus, name="videostatus"),
        default=VideoStatus.uploading,
        server_default=VideoStatus.uploading.value,
        nullable=False,
    )
    # ── Multipart upload state ─────────────────────────────────────────────
    # upload_id: S3/MinIO MultipartUpload identifier. Null cuando el upload
    # ya se cerró (o nunca se inició). Se usa para reanudar o abortar.
    upload_id: Mapped[str | None] = mapped_column(String(255))
    # upload_parts: lista serializada de {PartNumber, ETag, Size} que el
    # cliente va subiendo. En S3 se puede consultar con list_parts; lo
    # cacheamos aquí para ahorrar una llamada.
    upload_parts: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    # Stores validation/processing errors for display to the user
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
