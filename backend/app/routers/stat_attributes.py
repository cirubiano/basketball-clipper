"""
Stat attributes — estadísticas personalizadas por equipo y valores por partido.

GET    /{club_id}/teams/{team_id}/stat-attributes              → listar atributos activos
POST   /{club_id}/teams/{team_id}/stat-attributes              → crear atributo (HC o TD)
PATCH  /{club_id}/teams/{team_id}/stat-attributes/{attr_id}    → renombrar (HC o TD)
DELETE /{club_id}/teams/{team_id}/stat-attributes/{attr_id}    → archivar (HC o TD)

GET    /{club_id}/teams/{team_id}/matches/{match_id}/custom-stats         → listar
PUT    /{club_id}/teams/{team_id}/matches/{match_id}/custom-stats         → upsert
DELETE /{club_id}/teams/{team_id}/matches/{match_id}/custom-stats/{sid}  → eliminar
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.match import Match
from app.models.profile import Profile, UserRole
from app.models.stat_attribute import CustomMatchStat, TeamStatAttribute
from app.models.team import Team
from app.models.user import User
from app.schemas.stat_attribute import (
    CustomMatchStatResponse,
    CustomMatchStatUpsert,
    StatAttributeCreate,
    StatAttributeResponse,
    StatAttributeUpdate,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_team_or_404(club_id: int, team_id: int, db: AsyncSession) -> Team:
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _require_team_member(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> Profile:
    """Cualquier miembro activo del equipo o TD del club."""
    if user.is_admin:
        return None  # type: ignore[return-value]
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
            (Profile.team_id == team_id) | (Profile.role == UserRole.technical_director),
        )
    )
    if profile is None:
        raise HTTPException(status_code=403, detail="Team access required")
    return profile


async def _require_coach_or_td(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> None:
    """Solo HeadCoach del equipo o TechnicalDirector del club."""
    if user.is_admin:
        return
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
            (
                ((Profile.team_id == team_id) & (Profile.role == UserRole.head_coach))
                | (Profile.role == UserRole.technical_director)
            ),
        )
    )
    if profile is None:
        raise HTTPException(status_code=403, detail="Head coach or Technical Director required")


# ── Stat attributes ────────────────────────────────────────────────────────────

@router.get(
    "/{club_id}/teams/{team_id}/stat-attributes",
    response_model=list[StatAttributeResponse],
)
async def list_stat_attributes(
    club_id: int,
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StatAttributeResponse]:
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    attrs = (await db.scalars(
        select(TeamStatAttribute)
        .where(
            TeamStatAttribute.team_id == team_id,
            TeamStatAttribute.archived_at.is_(None),
        )
        .order_by(TeamStatAttribute.created_at)
    )).all()
    return list(attrs)


@router.post(
    "/{club_id}/teams/{team_id}/stat-attributes",
    response_model=StatAttributeResponse,
    status_code=201,
)
async def create_stat_attribute(
    club_id: int,
    team_id: int,
    body: StatAttributeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatAttributeResponse:
    await _get_team_or_404(club_id, team_id, db)
    await _require_coach_or_td(club_id, team_id, current_user, db)

    attr = TeamStatAttribute(
        team_id=team_id,
        name=body.name,
        short_name=body.short_name,
        description=body.description,
        color=body.color,
        type=body.type,
    )
    db.add(attr)
    await db.commit()
    await db.refresh(attr)
    return attr


@router.patch(
    "/{club_id}/teams/{team_id}/stat-attributes/{attr_id}",
    response_model=StatAttributeResponse,
)
async def update_stat_attribute(
    club_id: int,
    team_id: int,
    attr_id: int,
    body: StatAttributeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatAttributeResponse:
    await _get_team_or_404(club_id, team_id, db)
    await _require_coach_or_td(club_id, team_id, current_user, db)

    attr = await db.get(TeamStatAttribute, attr_id)
    if attr is None or attr.team_id != team_id or attr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Stat attribute not found")

    attr.name = body.name
    attr.short_name = body.short_name
    attr.description = body.description
    attr.color = body.color
    await db.commit()
    await db.refresh(attr)
    return attr


@router.delete(
    "/{club_id}/teams/{team_id}/stat-attributes/{attr_id}",
    status_code=204,
)
async def archive_stat_attribute(
    club_id: int,
    team_id: int,
    attr_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_team_or_404(club_id, team_id, db)
    await _require_coach_or_td(club_id, team_id, current_user, db)

    attr = await db.get(TeamStatAttribute, attr_id)
    if attr is None or attr.team_id != team_id or attr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Stat attribute not found")

    attr.archived_at = datetime.now(UTC)
    await db.commit()


# ── Custom match stats ─────────────────────────────────────────────────────────

@router.get(
    "/{club_id}/teams/{team_id}/matches/{match_id}/custom-stats",
    response_model=list[CustomMatchStatResponse],
)
async def list_custom_match_stats(
    club_id: int,
    team_id: int,
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CustomMatchStatResponse]:
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    match = await db.get(Match, match_id)
    if match is None or match.team_id != team_id:
        raise HTTPException(status_code=404, detail="Match not found")

    stats = (await db.scalars(
        select(CustomMatchStat).where(CustomMatchStat.match_id == match_id)
    )).all()
    return list(stats)


@router.put(
    "/{club_id}/teams/{team_id}/matches/{match_id}/custom-stats",
    response_model=CustomMatchStatResponse,
)
async def upsert_custom_match_stat(
    club_id: int,
    team_id: int,
    match_id: int,
    body: CustomMatchStatUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CustomMatchStatResponse:
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    match = await db.get(Match, match_id)
    if match is None or match.team_id != team_id:
        raise HTTPException(status_code=404, detail="Match not found")

    attr = await db.get(TeamStatAttribute, body.stat_attribute_id)
    if attr is None or attr.team_id != team_id or attr.archived_at is not None:
        raise HTTPException(status_code=404, detail="Stat attribute not found")

    # Build the WHERE clause depending on home or rival player
    if body.player_id is not None:
        filter_clause = (
            CustomMatchStat.match_id == match_id,
            CustomMatchStat.stat_attribute_id == body.stat_attribute_id,
            CustomMatchStat.player_id == body.player_id,
        )
        new_kwargs = dict(
            match_id=match_id,
            stat_attribute_id=body.stat_attribute_id,
            player_id=body.player_id,
            opponent_player_id=None,
            value=body.value,
        )
    else:
        filter_clause = (
            CustomMatchStat.match_id == match_id,
            CustomMatchStat.stat_attribute_id == body.stat_attribute_id,
            CustomMatchStat.opponent_player_id == body.opponent_player_id,
        )
        new_kwargs = dict(
            match_id=match_id,
            stat_attribute_id=body.stat_attribute_id,
            player_id=None,
            opponent_player_id=body.opponent_player_id,
            value=body.value,
        )

    existing = await db.scalar(select(CustomMatchStat).where(*filter_clause))
    if existing:
        existing.value = body.value
        await db.commit()
        await db.refresh(existing)
        return existing

    stat = CustomMatchStat(**new_kwargs)
    db.add(stat)
    await db.commit()
    await db.refresh(stat)
    return stat


@router.delete(
    "/{club_id}/teams/{team_id}/matches/{match_id}/custom-stats/{stat_id}",
    status_code=204,
)
async def delete_custom_match_stat(
    club_id: int,
    team_id: int,
    match_id: int,
    stat_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    stat = await db.get(CustomMatchStat, stat_id)
    if stat is None or stat.match_id != match_id:
        raise HTTPException(status_code=404, detail="Custom stat not found")

    await db.delete(stat)
    await db.commit()
