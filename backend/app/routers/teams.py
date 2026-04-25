"""
Teams — gestión de equipos.

Solo el TechnicalDirector puede crear y archivar equipos (RF-066).
Cualquier miembro del club puede consultarlos.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.season import Season
from app.models.team import Team
from app.models.user import User
from app.routers.clubs import _get_club_or_404, _require_club_access, _require_technical_director
from app.schemas.club import TeamCreate, TeamResponse

router = APIRouter()


@router.post("/{club_id}/teams", response_model=TeamResponse, status_code=201)
async def create_team(
    club_id: int,
    body: TeamCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    """Crea un equipo en el club. Solo TechnicalDirector o Admin (RF-066)."""
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    # Verifica que la temporada pertenece al club
    season = await db.get(Season, body.season_id)
    if season is None or season.club_id != club_id:
        raise HTTPException(status_code=404, detail="Season not found in this club")

    team = Team(club_id=club_id, season_id=body.season_id, name=body.name)
    db.add(team)
    await db.flush()
    return TeamResponse.model_validate(team)


@router.get("/{club_id}/teams", response_model=list[TeamResponse])
async def list_teams(
    club_id: int,
    season_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamResponse]:
    """Lista equipos del club, opcionalmente filtrados por temporada."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)

    stmt = select(Team).where(Team.club_id == club_id, Team.archived_at.is_(None))
    if season_id is not None:
        stmt = stmt.where(Team.season_id == season_id)
    stmt = stmt.order_by(Team.name)
    teams = (await db.scalars(stmt)).all()
    return [TeamResponse.model_validate(t) for t in teams]


@router.get("/{club_id}/teams/{team_id}", response_model=TeamResponse)
async def get_team(
    club_id: int,
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id:
        raise HTTPException(status_code=404, detail="Team not found")
    return TeamResponse.model_validate(team)


@router.delete("/{club_id}/teams/{team_id}", status_code=204)
async def archive_team(
    club_id: int,
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Archiva (soft-delete) un equipo. Solo TechnicalDirector o Admin (RF-065, RF-066)."""
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id:
        raise HTTPException(status_code=404, detail="Team not found")
    team.archived_at = datetime.now(timezone.utc)
    await db.flush()
