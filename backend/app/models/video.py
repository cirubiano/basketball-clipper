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

    Flujo normal:  uploading → pending → processing → completed
    Errores:       processing → error (fallo del detector/cutter)

    Nota: el enum en PostgreSQL conserva un valor legado 'validating'
    de una fase anterior. No se usa en el código.
    """
    uploading = "uploading"
    pending = "pending"
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
    # Título legible añadido por el usuario al subir. Nullable por
    # compatibilidad con filas anteriores a la migración 0003.
    title: Mapped[str | None] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[VideoStatus] = mapped_column(
        Enum(VideoStatus, name="videostatus"),
        default=VideoStatus.uploading,
        server_default=VideoStatus.uploading.value,
        nullable=False,
    )
    upload_id: Mapped[str | None] = mapped_column(String(255))
    upload_parts: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
