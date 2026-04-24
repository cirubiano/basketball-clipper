"""
Flujo multipart upload — sustituye al antiguo POST /videos/upload.

Endpoints:
  POST   /videos/init-upload           crea Video + multipart en S3
  GET    /videos/{id}/upload-status    ver partes ya subidas (reanudar)
  POST   /videos/{id}/complete-upload  cerrar multipart, encolar pipeline
  POST   /videos/{id}/abort-upload     abortar multipart, marcar Video como error
  GET    /videos/{id}/status           estado del procesado (igual que antes)

El upload real lo hace el navegador directamente contra S3/MinIO con las
URLs pre-firmadas. El backend solo coordina — nunca recibe los bytes del
vídeo por HTTP.
"""
import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.schemas.video import (
    CompleteUploadRequest,
    InitUploadRequest,
    InitUploadResponse,
    PresignedPart,
    UploadStatusResponse,
    UploadedPart,
    VideoStatusResponse,
)
from app.services import queue, storage

router = APIRouter()
logger = logging.getLogger(__name__)

_ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# Partes de 100 MiB: con el máximo S3 de 10k partes => tope de 1 TB. Cómodo
# para 15 GB (150 partes) sin saturar la BD con miles de URLs firmadas.
_PART_SIZE = 100 * 1024 * 1024
# Tope absoluto del tamaño de fichero aceptado. 20 GB deja margen sobre el
# objetivo de 15 GB sin abrir la puerta a abusos.
_MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024
# Máximo de partes según la API de S3
_MAX_PARTS = 10000


# ── Init ─────────────────────────────────────────────────────────────────────

@router.post("/init-upload", response_model=InitUploadResponse, status_code=201)
async def init_upload(
    body: InitUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InitUploadResponse:
    """
    Valida el fichero, crea el registro Video, inicia el multipart upload
    en S3/MinIO y devuelve una URL pre-firmada por cada parte. El cliente
    debe subir cada parte con PUT a su URL y recopilar los ETags.
    """
    ext = Path(body.filename).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Formato no soportado '{ext}'. Admitidos: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )
    if body.size > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichero demasiado grande ({body.size} bytes). Máximo: {_MAX_FILE_SIZE} bytes",
        )

    total_parts = max(1, (body.size + _PART_SIZE - 1) // _PART_SIZE)
    if total_parts > _MAX_PARTS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Demasiadas partes ({total_parts} > {_MAX_PARTS})",
        )

    s3_key = f"videos/{current_user.id}/{uuid.uuid4()}{ext}"

    # Crear multipart en S3 (síncrono, pero rápido — fuera del event loop
    # por seguridad para no bloquear a otros clientes).
    upload_id = await asyncio.to_thread(
        storage.create_multipart_upload, s3_key, body.content_type
    )

    video = Video(
        user_id=current_user.id,
        filename=body.filename,
        s3_key=s3_key,
        status=VideoStatus.uploading,
        upload_id=upload_id,
        upload_parts=[],
    )
    db.add(video)
    await db.flush()
    await db.commit()

    # Generar las URLs firmadas. 150 URLs para 15 GB → unas decenas de ms.
    urls = await asyncio.to_thread(
        _generate_all_part_urls, s3_key, upload_id, total_parts
    )

    return InitUploadResponse(
        video_id=video.id,
        upload_id=upload_id,
        s3_key=s3_key,
        part_size=_PART_SIZE,
        total_parts=total_parts,
        urls=urls,
    )


def _generate_all_part_urls(
    s3_key: str, upload_id: str, total_parts: int
) -> list[PresignedPart]:
    """Runs inside asyncio.to_thread to avoid blocking the event loop."""
    return [
        PresignedPart(
            part_number=i,
            url=storage.generate_part_url(s3_key, upload_id, i),
        )
        for i in range(1, total_parts + 1)
    ]


# ── Resume ───────────────────────────────────────────────────────────────────

@router.get("/{video_id}/upload-status", response_model=UploadStatusResponse)
async def upload_status(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadStatusResponse:
    """
    Devuelve las partes ya confirmadas en S3. El cliente usa esto para
    reanudar un upload interrumpido — solo vuelve a subir las que falten.
    """
    video = await _get_user_video(db, video_id, current_user)

    uploaded: list[UploadedPart] = []
    if video.upload_id:
        parts = await asyncio.to_thread(storage.list_parts, video.s3_key, video.upload_id)
        uploaded = [UploadedPart(part_number=p["PartNumber"], etag=p["ETag"]) for p in parts]

    return UploadStatusResponse(
        video_id=video.id,
        upload_id=video.upload_id,
        s3_key=video.s3_key,
        status=video.status,
        uploaded_parts=uploaded,
    )


# ── Complete ─────────────────────────────────────────────────────────────────

@router.post("/{video_id}/complete-upload", response_model=VideoStatusResponse)
async def complete_upload(
    video_id: int,
    body: CompleteUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoStatusResponse:
    """
    Cierra el multipart upload en S3, marca el vídeo como 'pending' y
    encola el pipeline de procesado.
    """
    video = await _get_user_video(db, video_id, current_user)

    if video.status != VideoStatus.uploading or not video.upload_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Video not in 'uploading' state (current: {video.status.value})",
        )

    parts_payload = [
        {"PartNumber": p.part_number, "ETag": p.etag} for p in body.parts
    ]

    try:
        await asyncio.to_thread(
            storage.complete_multipart_upload,
            video.s3_key,
            video.upload_id,
            parts_payload,
        )
    except Exception as exc:
        logger.exception("complete_multipart_upload failed for video %d", video_id)
        video.status = VideoStatus.error
        video.error_message = f"Failed to finalize upload: {exc}"[:500]
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to finalize upload on storage",
        ) from exc

    video.status = VideoStatus.pending
    video.upload_id = None
    video.upload_parts = None
    await db.commit()

    # Encolar el pipeline de procesado
    queue.process_video.delay(video.id)

    return VideoStatusResponse(
        id=video.id,
        status=video.status,
        progress=0,
        error_message=None,
        created_at=video.created_at,
    )


# ── Abort ────────────────────────────────────────────────────────────────────

@router.post("/{video_id}/abort-upload", status_code=status.HTTP_204_NO_CONTENT)
async def abort_upload(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Aborta un multipart upload en curso. Libera el espacio de las partes
    subidas en S3 y deja la fila Video en estado 'error'.
    """
    video = await _get_user_video(db, video_id, current_user)

    if video.upload_id:
        await asyncio.to_thread(
            storage.abort_multipart_upload, video.s3_key, video.upload_id
        )

    video.status = VideoStatus.error
    video.error_message = "Upload aborted by user"
    video.upload_id = None
    video.upload_parts = None
    await db.commit()


# ── Status (sin cambios respecto al flujo antiguo) ──────────────────────────

@router.get("/{video_id}/status", response_model=VideoStatusResponse)
async def get_video_status(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoStatusResponse:
    video = await _get_user_video(db, video_id, current_user)

    progress: int | None = None
    try:
        import redis.asyncio as aioredis  # noqa: PLC0415

        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        cached = await r.get(f"video:{video_id}:progress")
        await r.aclose()
        if cached:
            progress = json.loads(cached).get("progress")
    except Exception:
        pass  # Redis unavailable — fall back to DB status only

    return VideoStatusResponse(
        id=video.id,
        status=video.status,
        progress=progress,
        error_message=video.error_message,
        created_at=video.created_at,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_user_video(
    db: AsyncSession, video_id: int, user: User
) -> Video:
    video = await db.get(Video, video_id)
    if not video or video.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return video
