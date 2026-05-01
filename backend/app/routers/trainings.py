"""
Trainings — entrenamientos de un equipo.

GET    /{club_id}/teams/{team_id}/trainings                              → listar
POST   /{club_id}/teams/{team_id}/trainings                              → crear
GET    /{club_id}/teams/{team_id}/trainings/{training_id}               → detalle
PATCH  /{club_id}/teams/{team_id}/trainings/{training_id}               → actualizar
DELETE /{club_id}/teams/{team_id}/trainings/{training_id}               → archivar

POST   /{club_id}/teams/{team_id}/trainings/{training_id}/drills        → añadir ejercicio
DELETE /{club_id}/teams/{team_id}/trainings/{training_id}/drills/{did}  → eliminar ejercicio

POST   /{club_id}/teams/{team_id}/trainings/{training_id}/attendance    → registrar asistencia
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.drill import Drill
from app.models.player import Player
from app.models.profile import Profile, UserRole
from app.models.team import Team
from app.models.training import AbsenceReason, Training, TrainingAttendance, TrainingDrill
from app.models.user import User
from app.routers.clubs import _get_club_or_404
from app.schemas.training import (
    AttendanceUpdate,
    TrainingAttendanceResponse,
    TrainingCreate,
    TrainingDrillAdd,
    TrainingDrillReorderItem,
    TrainingDrillResponse,
    TrainingResponse,
    TrainingUpdate,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_team_member(
    club_id: int, team_id: int, user: User, db: AsyncSession
) -> Profile:
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
    if user.is_admin or profile is None:
        return
    if profile.role not in (UserRole.head_coach, UserRole.technical_director):
        raise HTTPException(status_code=403, detail="Coach or Technical Director required")


async def _get_team_or_404(club_id: int, team_id: int, db: AsyncSession) -> Team:
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _get_training_or_404(training_id: int, team_id: int, db: AsyncSession) -> Training:
    stmt = (
        select(Training)
        .options(
            selectinload(Training.training_drills).selectinload(TrainingDrill.drill),
            selectinload(Training.training_attendances).selectinload(TrainingAttendance.player),
        )
        .where(
            Training.id == training_id,
            Training.team_id == team_id,
            Training.archived_at.is_(None),
        )
    )
    training = await db.scalar(stmt)
    if training is None:
        raise HTTPException(status_code=404, detail="Training not found")
    return training


def _serialize_training(training: Training) -> TrainingResponse:
    drills = [
        TrainingDrillResponse(
            id=td.id,
            training_id=td.training_id,
            drill_id=td.drill_id,
            position=td.position,
            notes=td.notes,
            drill_title=td.drill.name if td.drill else None,
            drill_type=td.drill.type.value if td.drill and td.drill.type else None,
        )
        for td in sorted(training.training_drills, key=lambda x: x.position)
    ]
    attendances = [
        TrainingAttendanceResponse(
            id=ta.id,
            training_id=ta.training_id,
            player_id=ta.player_id,
            attended=ta.attended,
            is_late=ta.is_late,
            absence_reason=ta.absence_reason,
            notes=ta.notes,
            player_first_name=ta.player.first_name if ta.player else None,
            player_last_name=ta.player.last_name if ta.player else None,
        )
        for ta in training.training_attendances
    ]
    return TrainingResponse(
        id=training.id,
        team_id=training.team_id,
        season_id=training.season_id,
        date=training.date,
        title=training.title,
        notes=training.notes,
        created_by=training.created_by,
        created_at=training.created_at,
        archived_at=training.archived_at,
        training_drills=drills,
        training_attendances=attendances,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{club_id}/teams/{team_id}/trainings", response_model=list[TrainingResponse])
async def list_trainings(
    club_id: int,
    team_id: int,
    season_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrainingResponse]:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)

    stmt = (
        select(Training)
        .options(
            selectinload(Training.training_drills).selectinload(TrainingDrill.drill),
            selectinload(Training.training_attendances).selectinload(TrainingAttendance.player),
        )
        .where(Training.team_id == team_id, Training.archived_at.is_(None))
    )
    if season_id is not None:
        stmt = stmt.where(Training.season_id == season_id)
    stmt = stmt.order_by(Training.date.desc())

    result = await db.execute(stmt)
    return [_serialize_training(t) for t in result.scalars().all()]


@router.post("/{club_id}/teams/{team_id}/trainings", response_model=TrainingResponse, status_code=201)
async def create_training(
    club_id: int,
    team_id: int,
    body: TrainingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    training = Training(
        team_id=team_id,
        season_id=body.season_id,
        date=body.date,
        title=body.title,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(training)
    await db.flush()
    await db.commit()
    return _serialize_training(await _get_training_or_404(training.id, team_id, db))


@router.get("/{club_id}/teams/{team_id}/trainings/{training_id}", response_model=TrainingResponse)
async def get_training(
    club_id: int,
    team_id: int,
    training_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_team_member(club_id, team_id, current_user, db)
    training = await _get_training_or_404(training_id, team_id, db)
    return _serialize_training(training)


@router.patch("/{club_id}/teams/{team_id}/trainings/{training_id}", response_model=TrainingResponse)
async def update_training(
    club_id: int,
    team_id: int,
    training_id: int,
    body: TrainingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    training = await _get_training_or_404(training_id, team_id, db)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(training, key, value)
    await db.commit()
    return _serialize_training(await _get_training_or_404(training_id, team_id, db))


@router.delete("/{club_id}/teams/{team_id}/trainings/{training_id}", status_code=204)
async def archive_training(
    club_id: int,
    team_id: int,
    training_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    training = await _get_training_or_404(training_id, team_id, db)
    training.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)


# ── Ejercicios ─────────────────────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/trainings/{training_id}/drills",
    response_model=TrainingDrillResponse,
    status_code=201,
)
async def add_training_drill(
    club_id: int,
    team_id: int,
    training_id: int,
    body: TrainingDrillAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingDrillResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    training = await _get_training_or_404(training_id, team_id, db)

    drill = await db.get(Drill, body.drill_id)
    if drill is None or drill.archived_at is not None:
        raise HTTPException(status_code=404, detail="Drill not found")

    # Check for duplicate
    duplicate = await db.scalar(
        select(TrainingDrill).where(
            TrainingDrill.training_id == training_id,
            TrainingDrill.drill_id == body.drill_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Este ejercicio ya está en el entrenamiento.")

    # position = next after last
    position = len(training.training_drills)

    td = TrainingDrill(
        training_id=training_id,
        drill_id=body.drill_id,
        position=position,
        notes=body.notes,
    )
    db.add(td)
    await db.flush()
    await db.commit()
    await db.refresh(td)

    return TrainingDrillResponse(
        id=td.id,
        training_id=td.training_id,
        drill_id=td.drill_id,
        position=td.position,
        notes=td.notes,
        drill_title=drill.name,
        drill_type=drill.type.value if drill.type else None,
    )


@router.delete("/{club_id}/teams/{team_id}/trainings/{training_id}/drills/{td_id}", status_code=204)
async def remove_training_drill(
    club_id: int,
    team_id: int,
    training_id: int,
    td_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    td = await db.scalar(
        select(TrainingDrill).where(
            TrainingDrill.id == td_id,
            TrainingDrill.training_id == training_id,
        )
    )
    if td is None:
        raise HTTPException(status_code=404, detail="Training drill not found")

    removed_position = td.position
    await db.delete(td)
    await db.flush()

    # Compact positions after removal
    remaining = await db.execute(
        select(TrainingDrill)
        .where(
            TrainingDrill.training_id == training_id,
            TrainingDrill.position > removed_position,
        )
        .order_by(TrainingDrill.position)
    )
    for item in remaining.scalars().all():
        item.position -= 1

    await db.commit()
    return Response(status_code=204)


@router.patch(
    "/{club_id}/teams/{team_id}/trainings/{training_id}/drills",
    response_model=list[TrainingDrillResponse],
)
async def reorder_training_drills(
    club_id: int,
    team_id: int,
    training_id: int,
    body: list[TrainingDrillReorderItem],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrainingDrillResponse]:
    """Update the position of each TrainingDrill. Body: [{ drill_id, position }]."""
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)

    training = await _get_training_or_404(training_id, team_id, db)

    drill_id_to_td = {td.drill_id: td for td in training.training_drills}

    for item in body:
        td = drill_id_to_td.get(item.drill_id)
        if td is None:
            raise HTTPException(
                status_code=404,
                detail=f"Ejercicio {item.drill_id} no está en el entrenamiento.",
            )
        td.position = item.position

    await db.commit()
    training = await _get_training_or_404(training_id, team_id, db)
    return _serialize_training(training).training_drills


# ── Asistencia ────────────────────────────────────────────────────────────────

@router.post(
    "/{club_id}/teams/{team_id}/trainings/{training_id}/attendance",
    response_model=TrainingAttendanceResponse,
    status_code=200,
)
async def upsert_attendance(
    club_id: int,
    team_id: int,
    training_id: int,
    body: AttendanceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrainingAttendanceResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    profile = await _require_team_member(club_id, team_id, current_user, db)
    _require_coach_or_td(profile, current_user)
    await _get_training_or_404(training_id, team_id, db)

    player = await db.get(Player, body.player_id)
    if player is None or player.archived_at is not None:
        raise HTTPException(status_code=404, detail="Player not found")

    ta = await db.scalar(
        select(TrainingAttendance).where(
            TrainingAttendance.training_id == training_id,
            TrainingAttendance.player_id == body.player_id,
        )
    )
    if ta is None:
        ta = TrainingAttendance(
            training_id=training_id,
            player_id=body.player_id,
            attended=body.attended,
            is_late=body.is_late,
            absence_reason=body.absence_reason,
            notes=body.notes,
        )
        db.add(ta)
    else:
        ta.attended = body.attended
        ta.is_late = body.is_late
        ta.absence_reason = body.absence_reason
        ta.notes = body.notes

    await db.flush()
    await db.commit()
    await db.refresh(ta)

    return TrainingAttendanceResponse(
        id=ta.id,
        training_id=ta.training_id,
        player_id=ta.player_id,
        attended=ta.attended,
        is_late=ta.is_late,
        absence_reason=ta.absence_reason,
        notes=ta.notes,
        player_first_name=player.first_name,
        player_last_name=player.last_name,
    )
