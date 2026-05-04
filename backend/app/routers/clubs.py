"""
Clubs — gestión de clubs.

Solo un Admin puede crear clubs (RF-022).
Solo un TechnicalDirector o Admin puede gestionar miembros y perfiles.
Cualquier miembro del club puede consultarlo.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.profile import Profile, UserRole
from app.models.season import Season
from app.models.team import Team
from app.models.user import User
from app.schemas.club import (
    AddMemberRequest,
    AssignProfileRequest,
    ClubCreate,
    ClubMemberResponse,
    ClubResponse,
    ClubUpdate,
    ProfileResponse,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_club_or_404(club_id: int, db: AsyncSession) -> Club:
    club = await db.get(Club, club_id)
    if club is None or club.archived_at is not None:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


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


async def _require_technical_director(club_id: int, user: User, db: AsyncSession) -> None:
    """Verifica que el usuario es TechnicalDirector activo del club (o Admin)."""
    if user.is_admin:
        return
    result = await db.scalar(
        select(Profile).where(
            Profile.user_id == user.id,
            Profile.club_id == club_id,
            Profile.role == UserRole.technical_director,
            Profile.archived_at.is_(None),
        )
    )
    if result is None:
        raise HTTPException(
            status_code=403,
            detail="TechnicalDirector access required for this club.",
        )


# ── Clubs ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ClubResponse, status_code=201)
async def create_club(
    body: ClubCreate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    """Crea un club. Solo Admin (RF-022)."""
    club = Club(name=body.name)
    db.add(club)
    await db.flush()
    return ClubResponse.model_validate(club)


@router.get("/mine", response_model=list[ClubResponse])
async def list_my_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClubResponse]:
    """Lista los clubs a los que pertenece el usuario autenticado."""
    stmt = (
        select(Club)
        .join(Profile, Profile.club_id == Club.id)
        .where(
            Profile.user_id == current_user.id,
            Profile.archived_at.is_(None),
            Club.archived_at.is_(None),
        )
        .distinct()
        .order_by(Club.name)
    )
    clubs = (await db.scalars(stmt)).all()
    return [ClubResponse.model_validate(c) for c in clubs]


@router.get("/{club_id}", response_model=ClubResponse)
async def get_club(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    club = await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    return ClubResponse.model_validate(club)


@router.patch("/{club_id}", response_model=ClubResponse)
async def update_club(
    club_id: int,
    body: ClubUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    """Actualiza nombre o logo del club. Solo Admin."""
    club = await _get_club_or_404(club_id, db)
    if body.name is not None:
        club.name = body.name
    if body.logo_url is not None:
        club.logo_url = body.logo_url
    await db.flush()
    return ClubResponse.model_validate(club)


# ── Members ───────────────────────────────────────────────────────────────────

@router.post("/{club_id}/members", response_model=ClubMemberResponse, status_code=201)
async def add_member(
    club_id: int,
    body: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubMemberResponse:
    """
    Añade un usuario al club como ClubMember (RF-041).
    Solo TechnicalDirector o Admin.
    Acepta user_id directo o email del usuario.
    """
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    if body.user_id is None and body.email is None:
        raise HTTPException(status_code=422, detail="Proporciona user_id o email.")

    if body.email and body.user_id is None:
        target_user = await db.scalar(select(User).where(User.email == body.email))
        if target_user is None:
            raise HTTPException(
                status_code=404,
                detail="No existe ningún usuario con ese email. Pídele que se registre primero en la plataforma.",
            )
    else:
        target_user = await db.get(User, body.user_id)
        if target_user is None:
            raise HTTPException(status_code=404, detail="User not found")

    existing = await db.scalar(
        select(ClubMember).where(
            ClubMember.club_id == club_id,
            ClubMember.user_id == target_user.id,
            ClubMember.archived_at.is_(None),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Este usuario ya pertenece al club.")

    member = ClubMember(
        club_id=club_id,
        user_id=target_user.id,
        invited_by=current_user.id,
    )
    db.add(member)
    await db.flush()
    await db.refresh(member)
    return ClubMemberResponse(
        id=member.id,
        club_id=member.club_id,
        user_id=member.user_id,
        user_email=target_user.email,
        invited_by=member.invited_by,
        joined_at=member.joined_at,
        archived_at=member.archived_at,
    )


@router.get("/{club_id}/members", response_model=list[ClubMemberResponse])
async def list_members(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClubMemberResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    stmt = (
        select(ClubMember)
        .options(joinedload(ClubMember.user))
        .where(
            ClubMember.club_id == club_id,
            ClubMember.archived_at.is_(None),
        )
        .order_by(ClubMember.joined_at)
    )
    members = (await db.scalars(stmt)).unique().all()
    return [
        ClubMemberResponse(
            id=m.id,
            club_id=m.club_id,
            user_id=m.user_id,
            user_email=m.user.email if m.user else None,
            invited_by=m.invited_by,
            joined_at=m.joined_at,
            archived_at=m.archived_at,
        )
        for m in members
    ]


@router.get("/{club_id}/profiles", response_model=list[ProfileResponse])
async def list_club_profiles(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProfileResponse]:
    """Lista todos los perfiles activos del club. Solo TechnicalDirector o Admin."""
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    stmt = (
        select(Profile)
        .options(
            selectinload(Profile.club),
            selectinload(Profile.team),
            selectinload(Profile.season),
            selectinload(Profile.user),
        )
        .where(
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
        )
        .order_by(Profile.created_at)
    )
    profiles = (await db.scalars(stmt)).all()
    return [_enrich_profile(p) for p in profiles]


# ── Profiles ──────────────────────────────────────────────────────────────────

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


@router.post("/{club_id}/profiles", response_model=ProfileResponse, status_code=201)
async def assign_profile(
    club_id: int,
    body: AssignProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """
    Asigna un perfil (rol en club/equipo) a un usuario que ya es ClubMember.
    Solo TechnicalDirector o Admin (RF-050, RF-023).

    Reglas:
    - TechnicalDirector -> team_id debe ser None.
    - HeadCoach / StaffMember -> team_id obligatorio.
    - El usuario debe ser ClubMember activo.
    """
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)

    if body.role == UserRole.technical_director and body.team_id is not None:
        raise HTTPException(
            status_code=422,
            detail="TechnicalDirector is club-level. team_id must be null.",
        )
    if body.role != UserRole.technical_director and body.team_id is None:
        raise HTTPException(
            status_code=422,
            detail=f"{body.role} requires a team_id.",
        )

    member = await db.scalar(
        select(ClubMember).where(
            ClubMember.club_id == club_id,
            ClubMember.user_id == body.user_id,
            ClubMember.archived_at.is_(None),
        )
    )
    if member is None:
        raise HTTPException(
            status_code=404,
            detail="User is not an active member of this club.",
        )

    season = await db.get(Season, body.season_id)
    if season is None or season.club_id != club_id:
        raise HTTPException(status_code=404, detail="Season not found in this club")

    if body.team_id is not None:
        team = await db.get(Team, body.team_id)
        if team is None or team.club_id != club_id:
            raise HTTPException(status_code=404, detail="Team not found in this club")

    profile = Profile(
        user_id=body.user_id,
        club_id=club_id,
        team_id=body.team_id,
        season_id=body.season_id,
        role=body.role,
    )
    db.add(profile)
    await db.flush()

    stmt = (
        select(Profile)
        .options(
            selectinload(Profile.club),
            selectinload(Profile.team),
            selectinload(Profile.season),
            selectinload(Profile.user),
        )
        .where(Profile.id == profile.id)
    )
    profile = await db.scalar(stmt)
    return _enrich_profile(profile)
