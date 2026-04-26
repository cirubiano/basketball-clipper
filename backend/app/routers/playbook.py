"""
TeamPlaybook — playbook de un equipo.

GET    /{club_id}/teams/{team_id}/playbook              → listar entradas
POST   /{club_id}/teams/{team_id}/playbook              → añadir drill al playbook
DELETE /{club_id}/teams/{team_id}/playbook/{entry_id}  → quitar del playbook (RF-166)
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.drill import Drill
from app.models.playbook import TeamPlaybookEntry
from app.models.profile import Profile, UserRole
from app.models.team import Team
from app.models.user import User
from app.routers.clubs import _get_club_or_404
from app.schemas.playbook import AddToPlaybookRequest, PlaybookEntryResponse

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_team_access(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> None:
    """El usuario tiene un perfil activo en el equipo o es TechnicalDirector del club."""
    if user.is_admin:
        return
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            or_(
                Profile.team_id == team_id,
                Profile.role == UserRole.technical_director,
            ),
            Profile.archived_at.is_(None),
        )
    )
    if profile is None:
        raise HTTPException(status_code=403, detail="Team access required")


async def _get_entry_or_404(
    entry_id: int, team_id: int, db: AsyncSession
) -> TeamPlaybookEntry:
    stmt = (
        select(TeamPlaybookEntry)
        .options(
            selectinload(TeamPlaybookEntry.drill).selectinload(Drill.tags),
        )
        .where(
            TeamPlaybookEntry.id == entry_id,
            TeamPlaybookEntry.team_id == team_id,
            TeamPlaybookEntry.archived_at.is_(None),
        )
    )
    entry = await db.scalar(stmt)
    if entry is None:
        raise HTTPException(status_code=404, detail="Playbook entry not found")
    return entry


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{club_id}/teams/{team_id}/playbook", response_model=list[PlaybookEntryResponse])
async def list_playbook(
    club_id: int,
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlaybookEntryResponse]:
    """RF-167: cualquier miembro del equipo puede ver todas las entradas del playbook."""
    await _get_club_or_404(club_id, db)

    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")

    await _require_team_access(club_id, team_id, current_user, db)

    stmt = (
        select(TeamPlaybookEntry)
        .options(
            selectinload(TeamPlaybookEntry.drill).selectinload(Drill.tags),
        )
        .where(
            TeamPlaybookEntry.team_id == team_id,
            TeamPlaybookEntry.archived_at.is_(None),
        )
        .order_by(TeamPlaybookEntry.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/{club_id}/teams/{team_id}/playbook",
    response_model=PlaybookEntryResponse,
    status_code=201,
)
async def add_to_playbook(
    club_id: int,
    team_id: int,
    body: AddToPlaybookRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlaybookEntryResponse:
    """RF-160: añade un drill de la biblioteca personal al playbook del equipo."""
    await _get_club_or_404(club_id, db)

    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")

    await _require_team_access(club_id, team_id, current_user, db)

    drill = await db.get(Drill, body.drill_id)
    if drill is None or drill.user_id != current_user.id or drill.archived_at is not None:
        raise HTTPException(status_code=404, detail="Drill not found in your library")
    if drill.is_catalog_copy or drill.is_team_owned:
        raise HTTPException(status_code=400, detail="Cannot add a copy or team-owned drill")

    # RF-161: un mismo drill solo puede estar una vez en el playbook del equipo
    existing = await db.scalar(
        select(TeamPlaybookEntry).where(
            TeamPlaybookEntry.team_id == team_id,
            TeamPlaybookEntry.drill_id == body.drill_id,
            TeamPlaybookEntry.archived_at.is_(None),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Drill is already in the team playbook")

    entry = TeamPlaybookEntry(
        team_id=team_id,
        drill_id=body.drill_id,
        added_by=current_user.id,
    )
    db.add(entry)
    await db.flush()
    await db.commit()
    return await _get_entry_or_404(entry.id, team_id, db)


@router.delete("/{club_id}/teams/{team_id}/playbook/{entry_id}", status_code=204)
async def remove_from_playbook(
    club_id: int,
    team_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    RF-166: quita un drill del playbook del equipo.
    RF-169: cualquier miembro del equipo puede quitar una entrada.
    No afecta a la biblioteca personal del autor.
    """
    await _get_club_or_404(club_id, db)
    await _require_team_access(club_id, team_id, current_user, db)
    entry = await _get_entry_or_404(entry_id, team_id, db)
    entry.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)
