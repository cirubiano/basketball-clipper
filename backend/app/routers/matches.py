"""
Matches — partidos de un equipo.

GET    /{club_id}/teams/{team_id}/matches                       → listar partidos
POST   /{club_id}/teams/{team_id}/matches                       → crear partido
GET    /{club_id}/teams/{team_id}/matches/{match_id}            → detalle de partido
PATCH  /{club_id}/teams/{team_id}/matches/{match_id}            → actualizar partido
DELETE /{club_id}/teams/{team_id}/matches/{match_id}            → archivar partido

POST   /{club_id}/teams/{team_id}/matches/{match_id}/players           → añadir jugador a convocatoria
DELETE /{club_id}/teams/{team_id}/matches/{match_id}/players/{pid}     → retirar jugador

POST   /{club_id}/teams/{team_id}/matches/{match_id}/videos            → vincular vídeo
DELETE /{club_id}/teams/{team_id}/matches/{match_id}/videos/{vid}      → desvincular vídeo

POST   /{club_id}/teams/{team_id}/matches/{match_id}/stats             → crear/actualizar stat de jugador
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.match import Match, MatchPlayer, MatchStat, MatchVideo
from app.models.player import Player, RosterEntry
from app.models.profile import Profile, UserRole
from app.models.team import Team
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.routers.clubs import _get_club_or_404
from app.schemas.match import (
    MatchCreate,
    MatchPlayerResponse,
    MatchResponse,
    MatchStatResponse,
    MatchStatUpsert,
    MatchUpdate,
    MatchVideoAdd,
    MatchVideoResponse,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_team_member(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> Profile:
    """Returns the active profile for the user in this team/club."""
    if user.is_admin:
        return None  # type: ignore[return-value]
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
        ).where(
            (Profile.team_id == team_id)
            | (Profile.role == UserRole.technical_director)
        )
    )
    if profile is None:
        raise HTTPException(status_code=403, detail="Team access required")
    return profile


def _require_coach_or_td(profile: Profile | None, user: User) -> None:
    """Only HeadCoach or TechnicalDirector may mutate match data."""
    if user.is_admin or profile is None:
        return
    if profile.role not in (UserRole.head_coach, UserRole.technical_director):
        raise HTTPException(status_code=403, detail="Coach or Technical Director required")


async def _get_team_or_404(club_id: int, team_id: int, db: AsyncSession) -> Team:
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _get_match_or_404(match_id: int, team_id: int, db: AsyncSession) -> Match:
    stmt = (
        select(Match)
        .options(
            selectinload(Match.match_videos).selectinload(MatchVideo.video),
            selectinload(Match.match_players).selectinload(MatchPlayer.player),
            selectinload(Match.match_stats).selectinload(MatchStat.player),
        )
        .where(
            Match.id == match_id,
            Match.team_id == team_id,
            Match.archived_at.is_(None),
        )
    )
    match = await db.scalar(stmt)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


def _serialize_match(match: Match) -> MatchResponse:
    videos = [
        MatchVideoResponse(
            id=mv.id,
            match_id=mv.match_id,
            video_id=mv.video_id,
            label=mv.label,
            video_title=mv.video.title if mv.video else None,
            video_s3_key=mv.video.s3_key if mv.video else None,
        )
        for mv in match.match_videos
    ]
    players = [
        MatchPlayerResponse(
            id=mp.id,
            match_id=mp.match_id,
            player_id=mp.player_id,
            player_first_name=mp.player.first_name if mp.player else None,
            player_last_name=mp.player.last_name if mp.player else None,
        )
        for mp in match.match_players
    ]
    stats = [
        MatchStatResponse(
            id=ms.id,
            match_id=ms.match_id,
            player_id=ms.player_id,
            points=ms.points,
            minutes=ms.minutes,
            assists=ms.assists,
            defensive_rebounds=ms.defensive_rebounds,
            offensive_rebounds=ms.offensive_rebounds,
            steals=ms.steals,
            turnovers=ms.turnovers,
            fouls=ms.fouls,
        )
        for ms in match.match_stats
    ]
    return MatchResponse(
        id=match.id,
        team_id=match.team_id,
        season_id=match.season_id,
        date=match.date,
        opponent_name=match.opponent_name,
        location=match.location,
        status=match.status,
        notes=match.notes,
        our_score=match.our_score,
        their_score=match.their_score,
        created_by=match.created_by,
        created_at=match.created_at,
        archived_at=match.archived_at,
        match_videos=videos,
        match_players=players,
        match_stats=stats,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{club_id}/teams/{team_id}/matches", response_model=list[MatchResponse])
async def list_matches(
    club_id: int,
    team_id: int,
    season_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    stmt = (
        select(Match)
        .options(
            selectinload(Match.match_videos).selectinload(MatchVideo.video),
            selectinload(Match.match_players).selectinload(MatchPlayer.player),
            selectinload(Match.match_stats).selectinload(MatchStat.player),
        )
        .where(Match.team_id == team_id, Match.archived_at.is_(None))
    )
    if season_id is not None:
        stmt = stmt.where(Match.season_id == season_id)
    stmt = stmt.order_by(Match.date.desc())

    result = await db.execute(stmt)
    return [_serialize_match(m) for m in result.scalars().all()]


@router.post("/{club_id}/teams/{team_id}/matches", response_model=MatchResponse, status_code=201)
async def create_match(
    club_id: int,
    team_id: int,
    body: MatchCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    match = Match(
        team_id=team_id,
        season_id=body.season_id,
        date=body.date,
        opponent_name=body.opponent_name,
        location=body.location,
        status=body.status,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(match)
    await db.flush()
    await db.commit()
    return _serialize_match(await _get_match_or_404(match.id, team_id, db))


@router.get("/{club_id}/teams/{team_id}/matches/{match_id}", response_model=MatchResponse)
async def get_match(
    club_id: int,
    team_id: int,
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)
    match = await _get_match_or_404(match_id, team_id, db)
    return _serialize_match(match)


@router.patch("/{club_id}/teams/{team_id}/matches/{match_id}", response_model=MatchResponse)
async def update_match(
    club_id: int,
    team_id: int,
    match_id: int,
    body: MatchUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    match = await _get_match_or_404(match_id, team_id, db)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(match, key, value)
    await db.commit()
    return _serialize_match(await _get_match_or_404(match_id, team_id, db))


@router.delete("/{club_id}/teams/{team_id}/matches/{match_id}", status_code=204)
async def archive_match(
    club_id: int,
    team_id: int,
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    match = await _get_match_or_404(match_id, team_id, db)
    match.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)


# ── Convocatoria ──────────────────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/matches/{match_id}/players",
    response_model=MatchPlayerResponse,
    status_code=201,
)
async def add_match_player(
    club_id: int,
    team_id: int,
    match_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchPlayerResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)
    await _get_match_or_404(match_id, team_id, db)

    player_id: int = body["player_id"]
    player = await db.get(Player, player_id)
    if player is None or player.archived_at is not None:
        raise HTTPException(status_code=404, detail="Player not found")

    existing = await db.scalar(
        select(MatchPlayer).where(
            MatchPlayer.match_id == match_id,
            MatchPlayer.player_id == player_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Player already in convocation")

    mp = MatchPlayer(match_id=match_id, player_id=player_id)
    db.add(mp)
    await db.flush()
    await db.commit()
    await db.refresh(mp)

    return MatchPlayerResponse(
        id=mp.id,
        match_id=mp.match_id,
        player_id=mp.player_id,
        player_first_name=player.first_name,
        player_last_name=player.last_name,
    )


@router.delete("/{club_id}/teams/{team_id}/matches/{match_id}/players/{player_id}", status_code=204)
async def remove_match_player(
    club_id: int,
    team_id: int,
    match_id: int,
    player_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    mp = await db.scalar(
        select(MatchPlayer).where(
            MatchPlayer.match_id == match_id,
            MatchPlayer.player_id == player_id,
        )
    )
    if mp is None:
        raise HTTPException(status_code=404, detail="Player not in convocation")
    await db.delete(mp)
    await db.commit()
    return Response(status_code=204)


# ── Vídeos ────────────────────────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/matches/{match_id}/videos",
    response_model=MatchVideoResponse,
    status_code=201,
)
async def add_match_video(
    club_id: int,
    team_id: int,
    match_id: int,
    body: MatchVideoAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchVideoResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)
    await _get_match_or_404(match_id, team_id, db)

    video = await db.get(Video, body.video_id)
    if video is None or video.status != VideoStatus.completed:
        raise HTTPException(status_code=404, detail="Completed video not found")

    existing = await db.scalar(
        select(MatchVideo).where(
            MatchVideo.match_id == match_id,
            MatchVideo.video_id == body.video_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Video already linked to match")

    mv = MatchVideo(match_id=match_id, video_id=body.video_id, label=body.label)
    db.add(mv)
    await db.flush()
    await db.commit()
    await db.refresh(mv)

    return MatchVideoResponse(
        id=mv.id,
        match_id=mv.match_id,
        video_id=mv.video_id,
        label=mv.label,
        video_title=video.title,
        video_s3_key=video.s3_key,
    )


@router.delete("/{club_id}/teams/{team_id}/matches/{match_id}/videos/{video_id}", status_code=204)
async def remove_match_video(
    club_id: int,
    team_id: int,
    match_id: int,
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    mv = await db.scalar(
        select(MatchVideo).where(
            MatchVideo.match_id == match_id,
            MatchVideo.video_id == video_id,
        )
    )
    if mv is None:
        raise HTTPException(status_code=404, detail="Video not linked to match")
    await db.delete(mv)
    await db.commit()
    return Response(status_code=204)


# ── Estadísticas ──────────────────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/matches/{match_id}/stats",
    response_model=MatchStatResponse,
    status_code=200,
)
async def upsert_match_stat(
    club_id: int,
    team_id: int,
    match_id: int,
    body: MatchStatUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MatchStatResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)
    await _get_match_or_404(match_id, team_id, db)

    # Verify the player is in the convocatoria
    in_convocatoria = await db.scalar(
        select(MatchPlayer).where(
            MatchPlayer.match_id == match_id,
            MatchPlayer.player_id == body.player_id,
        )
    )
    if in_convocatoria is None:
        raise HTTPException(
            status_code=422,
            detail=f"El jugador {body.player_id} no está en la convocatoria de este partido.",
        )

    stat = await db.scalar(
        select(MatchStat).where(
            MatchStat.match_id == match_id,
            MatchStat.player_id == body.player_id,
        )
    )
    if stat is None:
        stat = MatchStat(match_id=match_id, player_id=body.player_id)
        db.add(stat)

    data = body.model_dump(exclude_unset=True, exclude={"player_id"})
    for key, value in data.items():
        setattr(stat, key, value)

    await db.flush()
    await db.commit()
    await db.refresh(stat)

    return MatchStatResponse(
        id=stat.id,
        match_id=stat.match_id,
        player_id=stat.player_id,
        points=stat.points,
        minutes=stat.minutes,
        assists=stat.assists,
        defensive_rebounds=stat.defensive_rebounds,
        offensive_rebounds=stat.offensive_rebounds,
        steals=stat.steals,
        turnovers=stat.turnovers,
        fouls=stat.fouls,
    )
