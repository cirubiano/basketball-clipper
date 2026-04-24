"""
Endpoints de vídeos: subida multipart + lifecycle del trabajo.

Multipart upload (subida del fichero a S3/MinIO):
  POST   /videos/init-upload           crea Video + multipart en S3
  GET    /videos/{id}/upload-status    ver partes ya subidas (reanudar)
  POST   /videos/{id}/complete-upload  cerrar multipart, encolar pipeline
  POST   /videos/{id}/abort-upload     abortar multipart, marcar Video como error

Lifecycle (gestión de trabajos del usuario):
  GET    /videos                       listado de trabajos del usuario
  GET    /videos/{id}/status           estado del procesado
  POST   /videos/{id}/retry            re-encolar pipeline si está en error
  DELETE /videos/{id}                  borrar vídeo + clips + ficheros S3

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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.clip import Clip
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.schemas.clip import ClipResponse
from app.schemas.video import (
    CompleteUploadRequest,
    InitUploadRequest,
    InitUploadResponse,
    PresignedPart,
    UploadStatusResponse,
    UploadedPart,
    VideoListItem,
    VideoStatusResponse,
)
from app.services import queue, storage

router = APIRouter()
logger = logging.getLogger(__name__)

_ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

_PART_SIZE = 100 * 1024 * 1024
_MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024
_MAX_PARTS = 10000


# ── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[VideoListItem])
@router.get("/", response_model=list[VideoListItem], include_in_schema=False)
async def list_videos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VideoListItem]:
    """Devuelve los trabajos del usuario, más recientes primero, con su nº de clips."""
    stmt = (
        select(Video, func.count(Clip.id).label("clips_count"))
        .outerjoin(Clip, Clip.video_id == Video.id)
        .where(Video.user_id == current_user.id)
        .group_by(Video.id)
        .order_by(Video.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        VideoListItem(
            id=v.id,
            title=v.title,
            filename=v.filename,
            status=v.status,
            error_message=v.error_message,
            clips_count=int(clips_count),
            created_at=v.created_at,
        )
        for v, clips_count in rows
    ]


# ── Init upload ──────────────────────────────────────────────────────────────

@router.post("/init-upload", response_model=InitUploadResponse, status_code=201)
async def init_upload(
    body: InitUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InitUploadResponse:
    """
    Valida el fichero, crea el registro Video con su título, inicia el
    multipart upload en S3/MinIO y devuelve una URL pre-firmada por parte.
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

    upload_id = await asyncio.to_thread(
        storage.create_multipart_upload, s3_key, body.content_type
    )

    video = Video(
        user_id=current_user.id,
        title=body.title.strip(),
        filename=body.filename,
        s3_key=s3_key,
        status=VideoStatus.uploading,
        upload_id=upload_id,
        upload_parts=[],
    )
    db.add(video)
    await db.flush()
    await db.commit()

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


# ── Retry ────────────────────────────────────────────────────────────────────

@router.post("/{video_id}/retry", response_model=VideoStatusResponse)
async def retry_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoStatusResponse:
    """
    Re-encola el pipeline para un vídeo en estado 'error'. El fichero
    original sigue en S3 (no se borra al fallar el procesado), así que
    Celery puede repetir el trabajo sin necesidad de re-subir.
    """
    video = await _get_user_video(db, video_id, current_user)

    if video.status not in (VideoStatus.error, VideoStatus.invalid):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sólo se pueden reintentar vídeos en error (estado actual: {video.status.value})",
        )

    video.status = VideoStatus.pending
    video.error_message = None
    await db.commit()

    queue.process_video.delay(video.id)

    return VideoStatusResponse(
        id=video.id,
        status=video.status,
        progress=0,
        error_message=None,
        created_at=video.created_at,
    )


# ── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Borra un vídeo, todos sus clips, y los ficheros físicos de S3/MinIO.
    Operación irreversible.
    """
    video = await _get_user_video(db, video_id, current_user)

    # Si todavía hay multipart upload sin cerrar, abortar primero
    if video.upload_id:
        try:
            await asyncio.to_thread(
                storage.abort_multipart_upload, video.s3_key, video.upload_id
            )
        except Exception:
            logger.exception("delete_video: abort_multipart_upload failed (ignored)")

    # Borrar fichero original del vídeo
    try:
        await asyncio.to_thread(storage.delete_file, video.s3_key)
    except Exception:
        logger.exception("delete_video: delete_file failed for video.s3_key (ignored)")

    # Borrar todos los clips del vídeo en S3 (un solo barrido por prefijo)
    clips_prefix = f"clips/{video.user_id}/{video.id}/"
    try:
        await asyncio.to_thread(storage.delete_prefix, clips_prefix)
    except Exception:
        logger.exception("delete_video: delete_prefix failed for %s (ignored)", clips_prefix)

    # Borrar la fila Video — el ON DELETE CASCADE de la FK clips.video_id
    # se encarga de las filas Clip.
    await db.delete(video)
    await db.commit()



# ── Clips de un video ────────────────────────────────────────────────────────

@router.get("/{video_id}/clips", response_model=list[ClipResponse])
async def list_video_clips(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClipResponse]:
    """Lista los clips generados a partir de este vídeo, en orden cronológico."""
    video = await _get_user_video(db, video_id, current_user)

    result = await db.execute(
        select(Clip).where(Clip.video_id == video.id).order_by(Clip.start_time.asc())
    )
    clips = result.scalars().all()
    return [
        ClipResponse(
            id=c.id,
            video_id=c.video_id,
            start_time=c.start_time,
            end_time=c.end_time,
            team=c.team,
            s3_key=c.s3_key,
            url=storage.get_presigned_url(c.s3_key),
            duration=c.duration,
            created_at=c.created_at,
        )
        for c in clips
    ]


# ── Status (procesado en curso) ──────────────────────────────────────────────

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
        pass

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
