"""
Seasons — gestión de temporadas de un club.

Solo el TechnicalDirector (o Admin) puede crear y cambiar el estado de
temporadas (RF-100 a RF-103).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.season import Season, SeasonStatus
from app.models.user import User
from app.routers.clubs import _get_club_or_404, _require_technical_director, _require_club_access
from app.schemas.club import SeasonCreate, SeasonResponse, SeasonStatusUpdate

router = APIRouter()


@router.post("/{club_id}/seasons", response_model=SeasonResponse, status_code=201)
async def create_season(
    club_id: int,
    body: SeasonCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SeasonResponse:
    """Crea una temporada para el club. Solo TechnicalDirector o Admin (RF-102)."""
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    season = Season(
        club_id=club_id,
        name=body.name,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        status=SeasonStatus.future,
    )
    db.add(season)
    await db.flush()
    return SeasonResponse.model_validate(season)


@router.get("/{club_id}/seasons", response_model=list[SeasonResponse])
async def list_seasons(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SeasonResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    stmt = select(Season).where(Season.club_id == club_id).order_by(Season.created_at.desc())
    seasons = (await db.scalars(stmt)).all()
    return [SeasonResponse.model_validate(s) for s in seasons]


@router.patch("/{club_id}/seasons/{season_id}/status", response_model=SeasonResponse)
async def update_season_status(
    club_id: int,
    season_id: int,
    body: SeasonStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SeasonResponse:
    """
    Cambia el estado de una temporada.
    Si se activa (→ active), verifica que no haya otra temporada activa (RF-101).
    """
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    season = await db.get(Season, season_id)
    if season is None or season.club_id != club_id:
        raise HTTPException(status_code=404, detail="Season not found")

    if body.status == SeasonStatus.active:
        # RF-101: solo puede haber una temporada activa por club
        active = await db.scalar(
            select(Season).where(
                Season.club_id == club_id,
                Season.status == SeasonStatus.active,
                Season.id != season_id,
            )
        )
        if active:
            raise HTTPException(
                status_code=409,
                detail=f"Club already has an active season (id={active.id}). Archive it first.",
            )

    season.status = body.status
    await db.flush()
    return SeasonResponse.model_validate(season)
