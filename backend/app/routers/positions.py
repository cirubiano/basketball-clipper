"""
Club Positions — posiciones dinámicas del club.

Permisos:
  - Cualquier miembro del club puede consultar posiciones.
  - TechnicalDirector o HeadCoach pueden crear/editar/archivar.
  - Admin tiene acceso completo.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.club import Club
from app.models.club_position import ClubPosition
from app.models.profile import Profile, UserRole
from app.models.user import User
from app.schemas.player import (
    ClubPositionCreate,
    ClubPositionResponse,
    ClubPositionUpdate,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_club_or_404(club_id: int, db: AsyncSession) -> Club:
    club = await db.get(Club, club_id)
    if club is None or club.archived_at is not None:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


async def _require_club_access(club_id: int, user: User, db: AsyncSession) -> None:
    if user.is_admin:
        return
    result = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
        )
    )
    if result is None:
        raise HTTPException(status_code=403, detail="Access to this club is not allowed.")


async def _require_manage_access(club_id: int, user: User, db: AsyncSession) -> None:
    """Verifica que el usuario puede gestionar posiciones (TD o HC)."""
    if user.is_admin:
        return
    result = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
            Profile.role.in_([UserRole.technical_director, UserRole.head_coach]),
        )
    )
    if result is None:
        raise HTTPException(
            status_code=403,
            detail="Only TechnicalDirector or HeadCoach can manage positions.",
        )


# ── GET /clubs/{club_id}/positions ────────────────────────────────────────────

@router.get("/{club_id}/positions", response_model=list[ClubPositionResponse])
async def list_positions(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClubPositionResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)

    result = await db.execute(
        select(ClubPosition)
        .where(
            ClubPosition.club_id == club_id,
            ClubPosition.archived_at.is_(None),
        )
        .order_by(ClubPosition.name)
    )
    return result.scalars().all()


# ── POST /clubs/{club_id}/positions ──────────────────────────────────────────

@router.post("/{club_id}/positions", response_model=ClubPositionResponse, status_code=201)
async def create_position(
    club_id: int,
    body: ClubPositionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubPositionResponse:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, current_user, db)

    position = ClubPosition(club_id=club_id, **body.model_dump())
    db.add(position)
    await db.flush()
    await db.commit()
    await db.refresh(position)
    return position


# ── PATCH /clubs/{club_id}/positions/{pos_id} ─────────────────────────────────

@router.patch("/{club_id}/positions/{pos_id}", response_model=ClubPositionResponse)
async def update_position(
    club_id: int,
    pos_id: int,
    body: ClubPositionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubPositionResponse:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, current_user, db)

    position = await db.get(ClubPosition, pos_id)
    if position is None or position.club_id != club_id or position.archived_at is not None:
        raise HTTPException(status_code=404, detail="Position not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(position, field, value)

    await db.commit()
    await db.refresh(position)
    return position


# ── DELETE /clubs/{club_id}/positions/{pos_id} ────────────────────────────────

@router.delete("/{club_id}/positions/{pos_id}", status_code=204)
async def archive_position(
    club_id: int,
    pos_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, current_user, db)

    position = await db.get(ClubPosition, pos_id)
    if position is None or position.club_id != club_id or position.archived_at is not None:
        raise HTTPException(status_code=404, detail="Position not found")

    position.archived_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=204)
