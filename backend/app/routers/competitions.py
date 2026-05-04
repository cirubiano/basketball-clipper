"""
Competitions — ligas y torneos de un equipo.

GET    /{club_id}/teams/{team_id}/competitions               → listar competiciones
POST   /{club_id}/teams/{team_id}/competitions               → crear competición
PATCH  /{club_id}/teams/{team_id}/competitions/{comp_id}     → actualizar competición
DELETE /{club_id}/teams/{team_id}/competitions/{comp_id}     → archivar competición
POST   /{club_id}/teams/{team_id}/competitions/{comp_id}/set-default → marcar como default
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.competition import Competition
from app.models.match import Match
from app.models.profile import Profile, UserRole
from app.models.team import Team
from app.models.user import User
from app.routers.clubs import _get_club_or_404
from app.schemas.competition import CompetitionCreate, CompetitionResponse, CompetitionUpdate

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_team_coach(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> Profile:
    """Requires HeadCoach or TechnicalDirector profile."""
    if user.is_admin:
        return None  # type: ignore[return-value]
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.team_id == team_id,
            Profile.role.in_([UserRole.head_coach, UserRole.tech_director]),
            Profile.archived_at.is_(None),
        )
    )
    if not profile:
        # Also allow club-level tech_director
        profile = await db.scalar(
            select(Profile).where(
                Profile.user_id == user.id,
                Profile.club_id == club_id,
                Profile.role == UserRole.tech_director,
                Profile.archived_at.is_(None),
            )
        )
    if not profile:
        raise HTTPException(403, "Se requiere rol HeadCoach o TechnicalDirector")
    return profile


async def _get_competition_or_404(
    comp_id: int, team_id: int, db: AsyncSession
) -> Competition:
    comp = await db.scalar(
        select(Competition).where(
            Competition.id == comp_id,
            Competition.team_id == team_id,
            Competition.archived_at.is_(None),
        )
    )
    if not comp:
        raise HTTPException(404, "Competición no encontrada")
    return comp


async def _build_response(comp: Competition, db: AsyncSession) -> CompetitionResponse:
    match_count = await db.scalar(
        select(func.count()).where(
            Match.competition_id == comp.id,
            Match.archived_at.is_(None),
        )
    )
    return CompetitionResponse(
        id=comp.id,
        team_id=comp.team_id,
        season_id=comp.season_id,
        name=comp.name,
        is_default=comp.is_default,
        quarters=comp.quarters,
        minutes_per_quarter=comp.minutes_per_quarter,
        players_on_court=comp.players_on_court,
        bench_size=comp.bench_size,
        clock_type=comp.clock_type,
        overtime_minutes=comp.overtime_minutes,
        created_by=comp.created_by,
        created_at=comp.created_at,
        archived_at=comp.archived_at,
        match_count=match_count or 0,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/{club_id}/teams/{team_id}/competitions", response_model=list[CompetitionResponse])
async def list_competitions(
    club_id: int,
    team_id: int,
    season_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    stmt = select(Competition).where(
        Competition.team_id == team_id,
        Competition.archived_at.is_(None),
    )
    if season_id:
        stmt = stmt.where(Competition.season_id == season_id)
    stmt = stmt.order_by(Competition.is_default.desc(), Competition.name)
    comps = (await db.scalars(stmt)).all()
    return [await _build_response(c, db) for c in comps]


@router.post("/{club_id}/teams/{team_id}/competitions", response_model=CompetitionResponse, status_code=201)
async def create_competition(
    club_id: int,
    team_id: int,
    body: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_team_coach(club_id, team_id, user, db)

    # Verify team belongs to club
    team = await db.scalar(
        select(Team).where(Team.id == team_id, Team.club_id == club_id)
    )
    if not team:
        raise HTTPException(404, "Equipo no encontrado")

    # If new one is default, clear existing default for same team+season
    if body.is_default:
        existing_default = await db.scalar(
            select(Competition).where(
                Competition.team_id == team_id,
                Competition.season_id == body.season_id,
                Competition.is_default.is_(True),
                Competition.archived_at.is_(None),
            )
        )
        if existing_default:
            existing_default.is_default = False

    comp = Competition(
        team_id=team_id,
        season_id=body.season_id,
        name=body.name,
        is_default=body.is_default,
        quarters=body.quarters,
        minutes_per_quarter=body.minutes_per_quarter,
        players_on_court=body.players_on_court,
        bench_size=body.bench_size,
        clock_type=body.clock_type,
        overtime_minutes=body.overtime_minutes,
        created_by=user.id,
    )
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return await _build_response(comp, db)


@router.patch("/{club_id}/teams/{team_id}/competitions/{comp_id}", response_model=CompetitionResponse)
async def update_competition(
    club_id: int,
    team_id: int,
    comp_id: int,
    body: CompetitionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_team_coach(club_id, team_id, user, db)
    comp = await _get_competition_or_404(comp_id, team_id, db)

    if body.name is not None:
        comp.name = body.name
    if body.quarters is not None:
        comp.quarters = body.quarters
    if body.minutes_per_quarter is not None:
        comp.minutes_per_quarter = body.minutes_per_quarter
    if body.players_on_court is not None:
        comp.players_on_court = body.players_on_court
    if body.bench_size is not None:
        comp.bench_size = body.bench_size
    if body.clock_type is not None:
        comp.clock_type = body.clock_type
    if body.overtime_minutes is not None:
        comp.overtime_minutes = body.overtime_minutes

    if body.is_default is True and not comp.is_default:
        # Clear existing default for same team+season
        existing_default = await db.scalar(
            select(Competition).where(
                Competition.team_id == team_id,
                Competition.season_id == comp.season_id,
                Competition.is_default.is_(True),
                Competition.archived_at.is_(None),
                Competition.id != comp.id,
            )
        )
        if existing_default:
            existing_default.is_default = False
        comp.is_default = True
    elif body.is_default is False:
        comp.is_default = False

    await db.commit()
    await db.refresh(comp)
    return await _build_response(comp, db)


@router.delete("/{club_id}/teams/{team_id}/competitions/{comp_id}", status_code=204)
async def archive_competition(
    club_id: int,
    team_id: int,
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_team_coach(club_id, team_id, user, db)
    comp = await _get_competition_or_404(comp_id, team_id, db)
    comp.archived_at = datetime.now(timezone.utc)
    if comp.is_default:
        comp.is_default = False
    await db.commit()
    return Response(status_code=204)


@router.post("/{club_id}/teams/{team_id}/competitions/{comp_id}/set-default", response_model=CompetitionResponse)
async def set_default_competition(
    club_id: int,
    team_id: int,
    comp_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_team_coach(club_id, team_id, user, db)
    comp = await _get_competition_or_404(comp_id, team_id, db)

    # Clear existing default
    existing_default = await db.scalar(
        select(Competition).where(
            Competition.team_id == team_id,
            Competition.season_id == comp.season_id,
            Competition.is_default.is_(True),
            Competition.archived_at.is_(None),
            Competition.id != comp.id,
        )
    )
    if existing_default:
        existing_default.is_default = False

    comp.is_default = True
    await db.commit()
    await db.refresh(comp)
    return await _build_response(comp, db)
