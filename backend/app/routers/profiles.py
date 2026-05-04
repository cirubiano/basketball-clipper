"""
Profiles — gestión de perfiles y asignación de roles.

GET    /profiles           → perfiles del usuario autenticado (para el selector)
DELETE /profiles/{id}      → archivar un perfil (retirar rol)

La asignación de perfil (POST /clubs/{club_id}/profiles) vive en clubs.py
para mantener la coherencia de rutas bajo /clubs.
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.profile import Profile
from app.models.user import User
from app.routers.clubs import _require_technical_director
from app.schemas.club import ProfileResponse
from app.services.catalog import (
    break_catalog_references,
    freeze_all_club_playbook_entries,
    freeze_playbook_entries,
)

router = APIRouter()


def _enrich_profile(profile: Profile) -> ProfileResponse:
    """Construye un ProfileResponse con nombres desnormalizados para la UI."""
    return ProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        club_id=profile.club_id,
        team_id=profile.team_id,
        season_id=profile.season_id,
        role=profile.role,
        archived_at=profile.archived_at,
        created_at=profile.created_at,
        club_name=profile.club.name if profile.club else None,
        team_name=profile.team.name if profile.team else None,
        season_name=profile.season.name if profile.season else None,
        user_email=profile.user.email if profile.user else None,
    )


@router.get("", response_model=list[ProfileResponse])
async def list_my_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProfileResponse]:
    """
    Devuelve todos los perfiles activos del usuario autenticado.
    Este endpoint alimenta el selector de perfil del frontend (RF-010).
    """
    stmt = (
        select(Profile)
        .options(
            selectinload(Profile.club),
            selectinload(Profile.team),
            selectinload(Profile.season),
        )
        .where(
            Profile.user_id == current_user.id,
            Profile.archived_at.is_(None),
        )
        .order_by(Profile.created_at)
    )
    profiles = (await db.scalars(stmt)).all()
    return [_enrich_profile(p) for p in profiles]


@router.delete("/{profile_id}", status_code=204)
async def archive_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Archiva (soft-delete) un perfil — retira el rol a la persona.
    Solo TechnicalDirector del club o Admin (RF-052).
    No expulsa a la persona del club (RF-053).

    Efectos secundarios:
      - RF-164: si era el último perfil del usuario en ese equipo, congela sus
        entradas del playbook del equipo.
      - RF-124: si era el último perfil del usuario en ese club, rompe las
        referencias entre sus originales y las copias del catálogo.
    """
    profile = await db.get(Profile, profile_id)
    if profile is None or profile.archived_at is not None:
        raise HTTPException(status_code=404, detail="Profile not found")

    await _require_technical_director(profile.club_id, current_user, db)
    profile.archived_at = datetime.now(UTC)
    await db.flush()

    # RF-164: congelar entradas del playbook si pierde acceso al equipo
    if profile.team_id is not None:
        # Perfil de HeadCoach / StaffMember — congela solo las entradas del equipo concreto
        remaining_in_team = await db.scalar(
            select(Profile).where(
                Profile.user_id == profile.user_id,
                Profile.club_id == profile.club_id,
                Profile.team_id == profile.team_id,
                Profile.archived_at.is_(None),
            )
        )
        if remaining_in_team is None:
            await freeze_playbook_entries(profile.user_id, profile.team_id, db)
    else:
        # Perfil de TechnicalDirector (sin team_id) — si pierde todos los perfiles del
        # club, congela sus entradas en todos los equipos del club
        await freeze_all_club_playbook_entries(profile.user_id, profile.club_id, db)

    # RF-124: romper referencias del catálogo si pierde todos los perfiles del club
    await break_catalog_references(profile.user_id, profile.club_id, db)

    await db.commit()
