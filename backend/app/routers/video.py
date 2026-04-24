import asyncio
import json
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.schemas.video import VideoStatusResponse, VideoUploadResponse
from app.services import queue, storage

router = APIRouter()

_ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


@router.post("/upload", response_model=VideoUploadResponse, status_code=202)
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoUploadResponse:
    """
    Accepts a video file, uploads it to S3, persists a Video record, and
    enqueues the processing pipeline. Returns immediately with status=pending.
    """
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    # Write upload to a temp file to avoid holding the entire payload in memory
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        contents = await file.read()
        tmp.write(contents)
        tmp.close()

        s3_key = f"videos/{current_user.id}/{uuid.uuid4()}{ext}"
        await asyncio.to_thread(storage.upload_file, tmp.name, s3_key)
    finally:
        os.unlink(tmp.name)

    video = Video(
        user_id=current_user.id,
        filename=file.filename or f"upload{ext}",
        s3_key=s3_key,
        status=VideoStatus.pending,
    )
    db.add(video)
    # flush to get video.id, then commit so the Celery worker can find the row
    await db.flush()
    await db.commit()

    queue.process_video.delay(video.id)

    return VideoUploadResponse(
        id=video.id,
        status=video.status,
        message="Video received. Processing will begin shortly.",
    )


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
async def get_video_status(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoStatusResponse:
    """
    Returns the current processing status from the DB, enriched with the
    real-time progress percentage cached in Redis by the Celery worker.
    """
    video = await db.get(Video, video_id)
    if not video or video.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Pull the most recent progress value from Redis (may be ahead of the DB)
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
