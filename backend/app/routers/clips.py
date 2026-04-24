from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.clip import Clip
from app.models.user import User
from app.models.video import Video
from app.schemas.clip import ClipResponse
from app.services import storage

router = APIRouter()


@router.get("/", response_model=list[ClipResponse])
async def list_clips(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClipResponse]:
    """Returns all clips belonging to the authenticated user, newest first."""
    result = await db.execute(
        select(Clip)
        .join(Video, Clip.video_id == Video.id)
        .where(Video.user_id == current_user.id)
        .order_by(Clip.created_at.desc())
    )
    clips = result.scalars().all()
    return [_to_response(c) for c in clips]


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClipResponse:
    """Returns a single clip with a fresh pre-signed URL, or 404."""
    result = await db.execute(
        select(Clip)
        .join(Video, Clip.video_id == Video.id)
        .where(Clip.id == clip_id, Video.user_id == current_user.id)
    )
    clip = result.scalar_one_or_none()
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
    return _to_response(clip)


def _to_response(clip: Clip) -> ClipResponse:
    """Enriches a Clip ORM object with a fresh pre-signed S3 URL."""
    return ClipResponse(
        id=clip.id,
        video_id=clip.video_id,
        start_time=clip.start_time,
        end_time=clip.end_time,
        team=clip.team,
        s3_key=clip.s3_key,
        url=storage.get_presigned_url(clip.s3_key),
        duration=clip.duration,
        created_at=clip.created_at,
    )
