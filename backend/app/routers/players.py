"""
Players & Roster — gestion de jugadores del club y plantillas de equipo.

Permisos:
  - Cualquier miembro del club puede consultar jugadores y plantillas.
  - Solo TechnicalDirector o HeadCoach del equipo pueden crear/editar/archivar.
  - Admin tiene acceso completo.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.club import Club
from app.models.club_position import ClubPosition
from app.models.player import Player, RosterEntry
from app.models.profile import Profile, UserRole
from app.models.team import Team
from app.models.user import User
from app.schemas.player import (
    CsvImportResponse,
    PhotoUploadRequest,
    PhotoUploadResponse,
    PlayerCreate,
    PlayerResponse,
    PlayerUpdate,
    RosterEntryCreate,
    RosterEntryResponse,
    RosterEntryUpdate,
)
from app.services import storage

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_club_or_404(club_id: int, db: AsyncSession) -> Club:
    club = await db.get(Club, club_id)
    if club is None or club.archived_at is not None:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


async def _get_team_or_404(club_id: int, team_id: int, db: AsyncSession) -> Team:
    team = await db.get(Team, team_id)
    if team is None or team.club_id != club_id or team.archived_at is not None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _require_club_access(club_id: int, user: User, db: AsyncSession) -> None:
    """Verifica que el usuario tiene al menos un perfil activo en el club."""
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


async def _require_manage_access(club_id: int, team_id: int | None, user: User, db: AsyncSession) -> None:
    """
    Verifica que el usuario puede crear/editar jugadores o plantilla.
    - Admin: siempre.
    - TechnicalDirector del club: siempre dentro del club.
    - HeadCoach del equipo: solo para su equipo.
    """
    if user.is_admin:
        return
    stmt = select(Profile).where(
        Profile.user_id == user.id,
        Profile.club_id == club_id,
        Profile.archived_at.is_(None),
        Profile.role.in_([UserRole.technical_director, UserRole.head_coach]),
    )
    if team_id is not None:
        stmt = stmt.where(
            (Profile.role == UserRole.technical_director) |
            (Profile.team_id == team_id)
        )
    result = await db.scalar(stmt)
    if result is None:
        raise HTTPException(
            status_code=403,
            detail="Only TechnicalDirector or HeadCoach can manage players.",
        )


async def _load_positions(club_id: int, position_ids: list[int], db: AsyncSession) -> list[ClubPosition]:
    """Carga y valida posiciones por IDs, verificando que pertenezcan al club."""
    if not position_ids:
        return []
    result = await db.execute(
        select(ClubPosition).where(
            ClubPosition.id.in_(position_ids),
            ClubPosition.club_id == club_id,
            ClubPosition.archived_at.is_(None),
        )
    )
    positions = list(result.scalars().all())
    if len(positions) != len(set(position_ids)):
        raise HTTPException(status_code=422, detail="One or more position IDs are invalid")
    return positions


# ── GET /clubs/{club_id}/players ──────────────────────────────────────────────

@router.get("/{club_id}/players", response_model=list[PlayerResponse])
async def list_players(
    club_id: int,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)

    stmt = (
        select(Player)
        .options(selectinload(Player.positions))
        .where(Player.club_id == club_id)
    )
    if not include_archived:
        stmt = stmt.where(Player.archived_at.is_(None))
    stmt = stmt.order_by(Player.last_name, Player.first_name)

    result = await db.execute(stmt)
    return result.scalars().all()


# ── POST /clubs/{club_id}/players ─────────────────────────────────────────────

@router.post("/{club_id}/players", response_model=PlayerResponse, status_code=201)
async def create_player(
    club_id: int,
    body: PlayerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerResponse:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, None, current_user, db)

    player_data = body.model_dump(exclude={"position_ids"})
    player = Player(club_id=club_id, **player_data)
    if body.position_ids:
        player.positions = await _load_positions(club_id, body.position_ids, db)
    db.add(player)
    await db.flush()
    await db.commit()

    result = await db.execute(
        select(Player).options(selectinload(Player.positions)).where(Player.id == player.id)
    )
    return result.scalar_one()


# ── POST /clubs/{club_id}/players/photo-upload-url ───────────────────────────

_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
_MAX_SIZE_LABEL = "5 MB"

@router.post("/{club_id}/players/photo-upload-url", response_model=PhotoUploadResponse)
async def get_photo_upload_url(
    club_id: int,
    body: PhotoUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoUploadResponse:
    """Devuelve una URL pre-firmada PUT para subir una foto de jugador directamente
    a S3/MinIO desde el navegador, y la URL pública que se guardará en photo_url."""
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, None, current_user, db)

    if not body.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El content_type debe ser una imagen.")

    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no permitido. Usa: {', '.join(_ALLOWED_EXTENSIONS)}.",
        )

    s3_key = f"player-photos/{club_id}/{uuid4().hex}.{ext}"

    upload_url = await asyncio.to_thread(
        storage.generate_presigned_put_url, s3_key, body.content_type
    )
    # En dev (MinIO): URL directa sin firma — el bucket tiene anonymous download.
    # En prod (S3): URL pre-firmada con TTL máximo de 7 días. Reemplazar por CloudFront.
    photo_url = await asyncio.to_thread(storage.get_photo_url, s3_key)

    return PhotoUploadResponse(upload_url=upload_url, photo_url=photo_url)


# ── GET /clubs/{club_id}/players/{player_id} ─────────────────────────────────

@router.get("/{club_id}/players/{player_id}", response_model=PlayerResponse)
async def get_player(
    club_id: int,
    player_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerResponse:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)

    result = await db.execute(
        select(Player)
        .options(selectinload(Player.positions))
        .where(Player.id == player_id, Player.club_id == club_id)
    )
    player = result.scalar_one_or_none()
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


# ── PATCH /clubs/{club_id}/players/{player_id} ───────────────────────────────

@router.patch("/{club_id}/players/{player_id}", response_model=PlayerResponse)
async def update_player(
    club_id: int,
    player_id: int,
    body: PlayerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerResponse:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, None, current_user, db)

    result = await db.execute(
        select(Player)
        .options(selectinload(Player.positions))
        .where(Player.id == player_id, Player.club_id == club_id)
    )
    player = result.scalar_one_or_none()
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.archived_at is not None:
        raise HTTPException(status_code=409, detail="Cannot update an archived player")

    data = body.model_dump(exclude_unset=True)
    position_ids = data.pop("position_ids", None)
    for field, value in data.items():
        setattr(player, field, value)
    if position_ids is not None:
        player.positions = await _load_positions(club_id, position_ids, db)

    await db.commit()

    result = await db.execute(
        select(Player).options(selectinload(Player.positions)).where(Player.id == player_id)
    )
    return result.scalar_one()


# ── DELETE /clubs/{club_id}/players/{player_id} ───────────────────────────────
# Soft-delete: archiva el jugador (RF-090)

@router.delete("/{club_id}/players/{player_id}", status_code=204)
async def archive_player(
    club_id: int,
    player_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _require_manage_access(club_id, None, current_user, db)

    player = await db.get(Player, player_id)
    if player is None or player.club_id != club_id:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.archived_at is not None:
        raise HTTPException(status_code=409, detail="Player is already archived")

    now = datetime.now(timezone.utc)
    player.archived_at = now

    # RF-090: archivar en todas las plantillas activas
    result = await db.execute(
        select(RosterEntry).where(
            RosterEntry.player_id == player_id,
            RosterEntry.archived_at.is_(None),
        )
    )
    for entry in result.scalars().all():
        entry.archived_at = now

    await db.commit()
    return Response(status_code=204)


# ── GET /clubs/{club_id}/teams/{team_id}/roster ───────────────────────────────

@router.get("/{club_id}/teams/{team_id}/roster", response_model=list[RosterEntryResponse])
async def list_roster(
    club_id: int,
    team_id: int,
    season_id: int | None = None,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RosterEntryResponse]:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_club_access(club_id, current_user, db)

    stmt = (
        select(RosterEntry)
        .options(selectinload(RosterEntry.player).selectinload(Player.positions))
        .where(RosterEntry.team_id == team_id)
    )
    if season_id is not None:
        stmt = stmt.where(RosterEntry.season_id == season_id)
    if not include_archived:
        stmt = stmt.where(RosterEntry.archived_at.is_(None))
    stmt = stmt.order_by(RosterEntry.jersey_number)

    result = await db.execute(stmt)
    return result.scalars().all()


# ── POST /clubs/{club_id}/teams/{team_id}/roster ──────────────────────────────

@router.post("/{club_id}/teams/{team_id}/roster", response_model=RosterEntryResponse, status_code=201)
async def add_to_roster(
    club_id: int,
    team_id: int,
    body: RosterEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RosterEntryResponse:
    await _get_club_or_404(club_id, db)
    team = await _get_team_or_404(club_id, team_id, db)
    await _require_manage_access(club_id, team_id, current_user, db)

    # Verificar que el jugador pertenece al club
    player = await db.get(Player, body.player_id)
    if player is None or player.club_id != club_id or player.archived_at is not None:
        raise HTTPException(status_code=404, detail="Player not found in this club")

    # Verificar unicidad (player, team, season) — la constraint de BD no permite
    # duplicados aunque la entrada esté archivada, así que comprobamos ambos casos.
    existing = await db.scalar(
        select(RosterEntry).where(
            RosterEntry.player_id == body.player_id,
            RosterEntry.team_id == team_id,
            RosterEntry.season_id == team.season_id,
        )
    )
    if existing is not None:
        if existing.archived_at is None:
            raise HTTPException(status_code=409, detail="Player is already in this team's roster")
        else:
            raise HTTPException(status_code=409, detail="Player was previously in this roster and cannot be re-added to the same season")

    entry = RosterEntry(
        player_id=body.player_id,
        team_id=team_id,
        season_id=team.season_id,
        jersey_number=body.jersey_number,
        position=body.position,
    )
    db.add(entry)
    await db.flush()
    entry_id = entry.id
    await db.commit()

    result = await db.execute(
        select(RosterEntry)
        .options(selectinload(RosterEntry.player).selectinload(Player.positions))
        .where(RosterEntry.id == entry_id)
    )
    return result.scalar_one()


# ── PATCH /clubs/{club_id}/teams/{team_id}/roster/{entry_id} ─────────────────

@router.patch("/{club_id}/teams/{team_id}/roster/{entry_id}", response_model=RosterEntryResponse)
async def update_roster_entry(
    club_id: int,
    team_id: int,
    entry_id: int,
    body: RosterEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RosterEntryResponse:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_manage_access(club_id, team_id, current_user, db)

    entry = await db.get(RosterEntry, entry_id)
    if entry is None or entry.team_id != team_id:
        raise HTTPException(status_code=404, detail="Roster entry not found")
    if entry.archived_at is not None:
        raise HTTPException(status_code=409, detail="Cannot update an archived roster entry")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)

    await db.commit()

    result = await db.execute(
        select(RosterEntry)
        .options(selectinload(RosterEntry.player).selectinload(Player.positions))
        .where(RosterEntry.id == entry_id)
    )
    return result.scalar_one()


# ── DELETE /clubs/{club_id}/teams/{team_id}/roster/{entry_id} ────────────────

@router.delete("/{club_id}/teams/{team_id}/roster/{entry_id}", status_code=204)
async def remove_from_roster(
    club_id: int,
    team_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _get_team_or_404(club_id, team_id, db)
    await _require_manage_access(club_id, team_id, current_user, db)

    entry = await db.get(RosterEntry, entry_id)
    if entry is None or entry.team_id != team_id:
        raise HTTPException(status_code=404, detail="Roster entry not found")
    if entry.archived_at is not None:
        raise HTTPException(status_code=409, detail="Roster entry is already archived")

    entry.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)

# ── POST /clubs/{club_id}/players/import-csv ──────────────────────────────────

@router.post("/{club_id}/players/import-csv", response_model=CsvImportResponse, status_code=200)
async def import_players_from_csv(
    club_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CsvImportResponse:
    """
    Importa jugadores desde un CSV.

    Columnas esperadas (cabecera obligatoria):
      first_name, last_name, phone (opcional), date_of_birth (opcional, YYYY-MM-DD)

    - Si ya existe un jugador con el mismo first_name+last_name en el club, se omite.
    - Los errores de fila no detienen la importacion; se acumulan en `errors`.
    - Requiere rol TechnicalDirector o HeadCoach del club.
    """
    from datetime import date as _date  # noqa: PLC0415

    await _get_club_or_404(club_id, db)
    await _require_td_or_hc_any_team(club_id, current_user, db)

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos CSV (.csv)")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")  # utf-8-sig strips BOM if present
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="El CSV esta vacio o no tiene cabecera")

    # Normalize field names: strip whitespace and lower-case
    fieldnames_norm = [f.strip().lower() for f in reader.fieldnames]
    if "first_name" not in fieldnames_norm or "last_name" not in fieldnames_norm:
        raise HTTPException(
            status_code=400,
            detail="El CSV debe tener columnas 'first_name' y 'last_name'",
        )

    created = 0
    skipped = 0
    errors: list[dict] = []

    for row_num, raw_row in enumerate(reader, start=2):
        # Normalize keys
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items()}

        first_name = row.get("first_name", "").strip()
        last_name = row.get("last_name", "").strip()

        if not first_name or not last_name:
            errors.append({"row": row_num, "message": "first_name y last_name son obligatorios"})
            continue

        # Skip duplicates within this club (active players only)
        existing = await db.scalar(
            select(Player).where(
                Player.club_id == club_id,
                Player.first_name == first_name,
                Player.last_name == last_name,
                Player.archived_at.is_(None),
            )
        )
        if existing is not None:
            skipped += 1
            continue

        # Parse optional fields
        phone = row.get("phone", "").strip() or None
        dob: _date | None = None
        dob_str = row.get("date_of_birth", "").strip()
        if dob_str:
            try:
                dob = _date.fromisoformat(dob_str)
            except ValueError:
                errors.append({
                    "row": row_num,
                    "message": f"date_of_birth '{dob_str}' no es una fecha valida (use YYYY-MM-DD)",
                })
                continue

        db.add(
            Player(
                club_id=club_id,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                date_of_birth=dob,
            )
        )
        created += 1

    await db.commit()
    return CsvImportResponse(created=created, skipped=skipped, errors=errors)


async def _require_td_or_hc_any_team(club_id: int, user: User, db: AsyncSession) -> None:
    """El usuario es admin, TechnicalDirector del club, o HeadCoach de cualquier equipo del club."""
    if user.is_admin:
        return
    from app.models.profile import UserRole as _URole  # noqa: PLC0415
    profile = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.role.in_([_URole.technical_director, _URole.head_coach]),
            Profile.archived_at.is_(None),
        )
    )
    if profile is None:
        raise HTTPException(status_code=403, detail="TechnicalDirector or HeadCoach access required")
