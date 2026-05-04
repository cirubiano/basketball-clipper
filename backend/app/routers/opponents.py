"""
Opponents — equipos rivales del club y sus estadísticas de scouting.

GET    /{club_id}/opponents                                       → listar rivales del club
POST   /{club_id}/opponents                                       → crear rival
PATCH  /{club_id}/opponents/{opp_id}                             → actualizar rival
DELETE /{club_id}/opponents/{opp_id}                             → archivar rival

GET    /{club_id}/opponents/{opp_id}                             → detalle rival (con jugadores)
POST   /{club_id}/opponents/{opp_id}/players                     → añadir jugador
POST   /{club_id}/opponents/{opp_id}/players/bulk                → añadir jugadores en bulk
PATCH  /{club_id}/opponents/{opp_id}/players/{pid}               → actualizar jugador
DELETE /{club_id}/opponents/{opp_id}/players/{pid}               → archivar jugador

POST   /{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats   → upsert stat rival
DELETE /{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats/{stat_id} → borrar stat rival
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.match import Match
from app.models.opponent import OpponentMatchStat, OpponentPlayer, OpponentTeam
from app.models.profile import Profile, UserRole
from app.models.user import User
from app.routers.clubs import _get_club_or_404
from app.schemas.opponent import (
    OpponentMatchStatResponse,
    OpponentMatchStatUpsert,
    OpponentPlayerBulkCreate,
    OpponentPlayerCreate,
    OpponentPlayerResponse,
    OpponentPlayerUpdate,
    OpponentTeamCreate,
    OpponentTeamResponse,
    OpponentTeamSummary,
    OpponentTeamUpdate,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_coach_or_td(club_id: int, user: User, db: AsyncSession) -> None:
    if user.is_admin:
        return
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.role.in_([UserRole.head_coach, UserRole.tech_director]),
            Profile.archived_at.is_(None),
        )
    )
    if not profile:
        raise HTTPException(403, "Se requiere rol HeadCoach o TechnicalDirector")


async def _get_opponent_or_404(opp_id: int, club_id: int, db: AsyncSession) -> OpponentTeam:
    opp = await db.scalar(
        select(OpponentTeam)
        .options(selectinload(OpponentTeam.players))
        .where(
            OpponentTeam.id == opp_id,
            OpponentTeam.club_id == club_id,
        )
    )
    if not opp:
        raise HTTPException(404, "Rival no encontrado")
    return opp


async def _get_player_or_404(
    pid: int, opponent_team_id: int, db: AsyncSession
) -> OpponentPlayer:
    player = await db.scalar(
        select(OpponentPlayer).where(
            OpponentPlayer.id == pid,
            OpponentPlayer.opponent_team_id == opponent_team_id,
            OpponentPlayer.archived_at.is_(None),
        )
    )
    if not player:
        raise HTTPException(404, "Jugador rival no encontrado")
    return player


# ── OpponentTeam endpoints ─────────────────────────────────────────────────────

@router.get("/{club_id}/opponents", response_model=list[OpponentTeamSummary])
async def list_opponents(
    club_id: int,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    stmt = select(OpponentTeam).where(OpponentTeam.club_id == club_id)
    if not include_archived:
        stmt = stmt.where(OpponentTeam.archived_at.is_(None))
    stmt = stmt.order_by(OpponentTeam.name)
    opponents = (await db.scalars(stmt)).all()
    return opponents


@router.get("/{club_id}/opponents/{opp_id}", response_model=OpponentTeamResponse)
async def get_opponent(
    club_id: int,
    opp_id: int,
    include_archived_players: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    opp = await _get_opponent_or_404(opp_id, club_id, db)
    if not include_archived_players:
        opp.players = [p for p in opp.players if p.archived_at is None]
    return opp


@router.post("/{club_id}/opponents", response_model=OpponentTeamResponse, status_code=201)
async def create_opponent(
    club_id: int,
    body: OpponentTeamCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    opp = OpponentTeam(
        club_id=club_id,
        name=body.name,
        notes=body.notes,
        color=body.color,
        created_by=user.id,
    )
    db.add(opp)
    await db.commit()
    await db.refresh(opp, ["players"])
    return opp


@router.patch("/{club_id}/opponents/{opp_id}", response_model=OpponentTeamResponse)
async def update_opponent(
    club_id: int,
    opp_id: int,
    body: OpponentTeamUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    opp = await _get_opponent_or_404(opp_id, club_id, db)
    if body.name is not None:
        opp.name = body.name
    if body.notes is not None:
        opp.notes = body.notes
    if body.color is not None:
        opp.color = body.color
    await db.commit()
    await db.refresh(opp, ["players"])
    return opp


@router.delete("/{club_id}/opponents/{opp_id}", status_code=204)
async def archive_opponent(
    club_id: int,
    opp_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    opp = await _get_opponent_or_404(opp_id, club_id, db)
    opp.archived_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=204)


# ── OpponentPlayer endpoints ───────────────────────────────────────────────────

async def _verify_opp_belongs_to_club(opp_id: int, club_id: int, db: AsyncSession) -> None:
    opp_check = await db.scalar(
        select(OpponentTeam).where(
            OpponentTeam.id == opp_id,
            OpponentTeam.club_id == club_id,
            OpponentTeam.archived_at.is_(None),
        )
    )
    if not opp_check:
        raise HTTPException(404, "Rival no encontrado")


@router.post("/{club_id}/opponents/{opp_id}/players/bulk", response_model=list[OpponentPlayerResponse], status_code=201)
async def bulk_add_opponent_players(
    club_id: int,
    opp_id: int,
    body: OpponentPlayerBulkCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add multiple opponent players by jersey number in one request."""
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    await _verify_opp_belongs_to_club(opp_id, club_id, db)

    # Fetch existing active jerseys for this team to skip duplicates
    existing = await db.scalars(
        select(OpponentPlayer.jersey_number).where(
            OpponentPlayer.opponent_team_id == opp_id,
            OpponentPlayer.archived_at.is_(None),
            OpponentPlayer.jersey_number.isnot(None),
        )
    )
    existing_jerseys = set(existing.all())

    created: list[OpponentPlayer] = []
    for jersey in body.jersey_numbers:
        if jersey in existing_jerseys:
            continue  # silently skip duplicates
        player = OpponentPlayer(
            opponent_team_id=opp_id,
            name=f"#{jersey}",
            jersey_number=jersey,
        )
        db.add(player)
        created.append(player)
        existing_jerseys.add(jersey)  # prevent duplicates within the same request

    await db.commit()
    for p in created:
        await db.refresh(p)
    return created


@router.post("/{club_id}/opponents/{opp_id}/players", response_model=OpponentPlayerResponse, status_code=201)
async def add_opponent_player(
    club_id: int,
    opp_id: int,
    body: OpponentPlayerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    await _verify_opp_belongs_to_club(opp_id, club_id, db)

    # Reject duplicate jersey number within the same opponent team
    if body.jersey_number is not None:
        duplicate = await db.scalar(
            select(OpponentPlayer).where(
                OpponentPlayer.opponent_team_id == opp_id,
                OpponentPlayer.jersey_number == body.jersey_number,
                OpponentPlayer.archived_at.is_(None),
            )
        )
        if duplicate:
            raise HTTPException(409, f"Ya existe un jugador con el dorsal {body.jersey_number} en este equipo")

    player = OpponentPlayer(
        opponent_team_id=opp_id,
        name=body.name if body.name else f"#{body.jersey_number}",
        jersey_number=body.jersey_number,
        position=body.position,
    )
    db.add(player)
    await db.commit()
    await db.refresh(player)
    return player


@router.patch("/{club_id}/opponents/{opp_id}/players/{pid}", response_model=OpponentPlayerResponse)
async def update_opponent_player(
    club_id: int,
    opp_id: int,
    pid: int,
    body: OpponentPlayerUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    player = await _get_player_or_404(pid, opp_id, db)
    if body.name is not None:
        player.name = body.name
    if body.jersey_number is not None:
        player.jersey_number = body.jersey_number
    if body.position is not None:
        player.position = body.position
    await db.commit()
    await db.refresh(player)
    return player


@router.delete("/{club_id}/opponents/{opp_id}/players/{pid}", status_code=204)
async def archive_opponent_player(
    club_id: int,
    opp_id: int,
    pid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)
    player = await _get_player_or_404(pid, opp_id, db)
    player.archived_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=204)


# ── OpponentMatchStat endpoints ────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats",
    response_model=OpponentMatchStatResponse,
    status_code=201,
)
async def upsert_opponent_stat(
    club_id: int,
    team_id: int,
    match_id: int,
    body: OpponentMatchStatUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)

    match = await db.scalar(
        select(Match).where(
            Match.id == match_id,
            Match.team_id == team_id,
            Match.archived_at.is_(None),
        )
    )
    if not match:
        raise HTTPException(404, "Partido no encontrado")
    if not match.opponent_id:
        raise HTTPException(
            400, "El partido no tiene un rival registrado. Asigna un rival antes de registrar estadísticas."
        )

    # Verify opponent player belongs to the match's opponent team
    opp_player = await db.scalar(
        select(OpponentPlayer).where(
            OpponentPlayer.id == body.opponent_player_id,
            OpponentPlayer.opponent_team_id == match.opponent_id,
        )
    )
    if not opp_player:
        raise HTTPException(400, "El jugador no pertenece al rival de este partido")

    # Upsert
    existing = await db.scalar(
        select(OpponentMatchStat).where(
            OpponentMatchStat.match_id == match_id,
            OpponentMatchStat.opponent_player_id == body.opponent_player_id,
        )
    )
    if existing:
        stat = existing
    else:
        stat = OpponentMatchStat(
            match_id=match_id,
            opponent_player_id=body.opponent_player_id,
        )
        db.add(stat)

    for field in ["points", "minutes", "assists", "defensive_rebounds", "offensive_rebounds",
                          "steals", "turnovers", "fouls", "blocks"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(stat, field, val)

    await db.commit()
    stat = await db.scalar(
        select(OpponentMatchStat)
        .options(selectinload(OpponentMatchStat.opponent_player))
        .where(OpponentMatchStat.id == stat.id)
    )
    return stat


@router.delete(
    "/{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats/{stat_id}",
    status_code=204,
)
async def delete_opponent_stat(
    club_id: int,
    team_id: int,
    match_id: int,
    stat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_club_or_404(club_id, db)
    await _require_coach_or_td(club_id, user, db)

    stat = await db.scalar(
        select(OpponentMatchStat).where(
            OpponentMatchStat.id == stat_id,
            OpponentMatchStat.match_id == match_id,
        )
    )
    if not stat:
        raise HTTPException(404, "Estadística no encontrada")

    await db.delete(stat)
    await db.commit()
    return Response(status_code=204)
