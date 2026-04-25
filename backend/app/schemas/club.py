from datetime import date, datetime

from pydantic import BaseModel

from app.models.profile import UserRole
from app.models.season import SeasonStatus


# ── Club ──────────────────────────────────────────────────────────────────────

class ClubCreate(BaseModel):
    name: str


class ClubUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None


class ClubResponse(BaseModel):
    id: int
    name: str
    logo_url: str | None
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Season ────────────────────────────────────────────────────────────────────

class SeasonCreate(BaseModel):
    name: str
    starts_at: date | None = None
    ends_at: date | None = None


class SeasonStatusUpdate(BaseModel):
    status: SeasonStatus


class SeasonResponse(BaseModel):
    id: int
    club_id: int
    name: str
    status: SeasonStatus
    starts_at: date | None
    ends_at: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Team ──────────────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str
    season_id: int


class TeamResponse(BaseModel):
    id: int
    club_id: int
    season_id: int
    name: str
    archived_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── ClubMember ────────────────────────────────────────────────────────────────

class AddMemberRequest(BaseModel):
    """Añadir un usuario existente como miembro del club (RF-041)."""
    user_id: int


class ClubMemberResponse(BaseModel):
    id: int
    club_id: int
    user_id: int
    invited_by: int | None
    joined_at: datetime
    archived_at: datetime | None

    model_config = {"from_attributes": True}


# ── Profile ───────────────────────────────────────────────────────────────────

class AssignProfileRequest(BaseModel):
    """Asignar un perfil (rol en equipo/club) a un miembro del club."""
    user_id: int
    role: UserRole
    season_id: int
    team_id: int | None = None  # NULL para TechnicalDirector


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    club_id: int
    team_id: int | None
    season_id: int
    role: UserRole
    archived_at: datetime | None
    created_at: datetime
    # Campos enriquecidos para el selector de perfil (cargados en el router)
    club_name: str | None = None
    team_name: str | None = None
    season_name: str | None = None

    model_config = {"from_attributes": True}
