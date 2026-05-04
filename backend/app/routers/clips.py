from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_profile, get_current_user
from app.models.clip import Clip
from app.models.profile import Profile
from app.models.user import User
from app.models.video import Video
from app.schemas.clip import ClipResponse
from app.services import storage

router = APIRouter()


@router.get("/", response_model=list[ClipResponse])
async def list_clips(
    current_profile: Profile = Depends(get_current_profile),
    db: AsyncSession = Depends(get_db),
) -> list[ClipResponse]:
    """
    Devuelve los clips visibles para el perfil activo, más recientes primero.
    - HeadCoach / StaffMember: solo clips de su equipo.
    - TechnicalDirector: todos los clips del club.
    """
    if current_profile.team_id is not None:
        stmt = (
            select(Clip)
            .join(Video, Clip.video_id == Video.id)
            .where(Video.team_id == current_profile.team_id)
            .order_by(Clip.created_at.desc())
        )
    else:
        from app.models.team import Team  # noqa: PLC0415

        stmt = (
            select(Clip)
            .join(Video, Clip.video_id == Video.id)
            .join(Team, Team.id == Video.team_id)
            .where(Team.club_id == current_profile.club_id)
            .order_by(Clip.created_at.desc())
        )

    result = await db.execute(stmt)
    clips = result.scalars().all()
    return [_to_response(c) for c in clips]


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClipResponse:
    """Devuelve un clip concreto con URL pre-firmada fresca, o 404."""
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
    """Enriquece un Clip ORM con URLs pre-firmadas S3 frescas."""
    thumbnail_url: str | None = None
    if clip.thumbnail_s3_key:
        thumbnail_url = storage.get_presigned_url(clip.thumbnail_s3_key)
    return ClipResponse(
        id=clip.id,
        video_id=clip.video_id,
        start_time=clip.start_time,
        end_time=clip.end_time,
        team=clip.team,
        s3_key=clip.s3_key,
        url=storage.get_presigned_url(clip.s3_key),
        thumbnail_url=thumbnail_url,
        duration=clip.duration,
        created_at=clip.created_at,
    )
