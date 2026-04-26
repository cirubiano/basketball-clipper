"""
ClubCatalog — catálogo del club y sus tags.

GET    /{club_id}/catalog/tags                     → listar tags del club
POST   /{club_id}/catalog/tags                     → crear tag (TD)
PATCH  /{club_id}/catalog/tags/{tag_id}            → actualizar tag (TD)
DELETE /{club_id}/catalog/tags/{tag_id}            → archivar tag (TD)

GET    /{club_id}/catalog                          → listar entradas del catálogo
POST   /{club_id}/catalog                          → publicar drill al catálogo
GET    /{club_id}/catalog/{entry_id}               → detalle de entrada
POST   /{club_id}/catalog/{entry_id}/update-copy   → actualizar copia con original (autor)
POST   /{club_id}/catalog/{entry_id}/copy-to-library → copiar a biblioteca personal (RF-150)
DELETE /{club_id}/catalog/{entry_id}               → retirar del catálogo (autor o TD)
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.catalog import ClubCatalogEntry
from app.models.club_tag import ClubTag
from app.models.drill import Drill
from app.models.user import User
from app.routers.clubs import _get_club_or_404, _require_club_access, _require_technical_director
from app.schemas.catalog import (
    CatalogEntryResponse,
    ClubTagCreate,
    ClubTagResponse,
    ClubTagUpdate,
    PublishToCatalogRequest,
    UpdateCatalogTagsRequest,
)
from app.services.catalog import (
    _resolve_club_tags,
    copy_drill_to_library,
    create_catalog_copy,
    push_changes_to_catalog,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_entry_or_404(entry_id: int, club_id: int, db: AsyncSession) -> ClubCatalogEntry:
    stmt = (
        select(ClubCatalogEntry)
        .options(
            selectinload(ClubCatalogEntry.drill).selectinload(Drill.tags),
            selectinload(ClubCatalogEntry.tags),
        )
        .where(
            ClubCatalogEntry.id == entry_id,
            ClubCatalogEntry.club_id == club_id,
            ClubCatalogEntry.archived_at.is_(None),
        )
    )
    entry = await db.scalar(stmt)
    if entry is None:
        raise HTTPException(status_code=404, detail="Catalog entry not found")
    return entry


# ── Club Tags ──────────────────────────────────────────────────────────────────

@router.get("/{club_id}/catalog/tags", response_model=list[ClubTagResponse])
async def list_club_tags(
    club_id: int,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClubTagResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    stmt = select(ClubTag).where(ClubTag.club_id == club_id)
    if not include_archived:
        stmt = stmt.where(ClubTag.archived_at.is_(None))
    stmt = stmt.order_by(ClubTag.name)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{club_id}/catalog/tags", response_model=ClubTagResponse, status_code=201)
async def create_club_tag(
    club_id: int,
    body: ClubTagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubTagResponse:
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)
    tag = ClubTag(club_id=club_id, **body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/{club_id}/catalog/tags/{tag_id}", response_model=ClubTagResponse)
async def update_club_tag(
    club_id: int,
    tag_id: int,
    body: ClubTagUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubTagResponse:
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)
    tag = await db.get(ClubTag, tag_id)
    if tag is None or tag.club_id != club_id:
        raise HTTPException(status_code=404, detail="Club tag not found")
    if tag.archived_at is not None:
        raise HTTPException(status_code=409, detail="Cannot update an archived tag")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{club_id}/catalog/tags/{tag_id}", status_code=204)
async def archive_club_tag(
    club_id: int,
    tag_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_club_or_404(club_id, db)
    await _require_technical_director(club_id, current_user, db)
    tag = await db.get(ClubTag, tag_id)
    if tag is None or tag.club_id != club_id:
        raise HTTPException(status_code=404, detail="Club tag not found")
    if tag.archived_at is not None:
        raise HTTPException(status_code=409, detail="Tag is already archived")
    tag.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)


# ── Catalog Entries ────────────────────────────────────────────────────────────

@router.get("/{club_id}/catalog", response_model=list[CatalogEntryResponse])
async def list_catalog(
    club_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CatalogEntryResponse]:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    stmt = (
        select(ClubCatalogEntry)
        .options(
            selectinload(ClubCatalogEntry.drill).selectinload(Drill.tags),
            selectinload(ClubCatalogEntry.tags),
        )
        .where(
            ClubCatalogEntry.club_id == club_id,
            ClubCatalogEntry.archived_at.is_(None),
        )
        .order_by(ClubCatalogEntry.updated_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{club_id}/catalog", response_model=CatalogEntryResponse, status_code=201)
async def publish_to_catalog(
    club_id: int,
    body: PublishToCatalogRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CatalogEntryResponse:
    """RF-120: publica una copia del drill al catálogo del club."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)

    drill = await db.get(Drill, body.drill_id)
    if drill is None or drill.user_id != current_user.id or drill.archived_at is not None:
        raise HTTPException(status_code=404, detail="Drill not found in your library")
    if drill.is_catalog_copy or drill.is_team_owned:
        raise HTTPException(status_code=400, detail="Cannot publish a copy or team-owned drill")

    entry = await create_catalog_copy(
        original=drill,
        publisher_user_id=current_user.id,
        club_id=club_id,
        tag_ids=body.tag_ids,
        db=db,
    )
    await db.commit()
    return await _get_entry_or_404(entry.id, club_id, db)


@router.get("/{club_id}/catalog/{entry_id}", response_model=CatalogEntryResponse)
async def get_catalog_entry(
    club_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CatalogEntryResponse:
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    return await _get_entry_or_404(entry_id, club_id, db)


@router.post("/{club_id}/catalog/{entry_id}/update-copy", response_model=CatalogEntryResponse)
async def update_catalog_copy(
    club_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CatalogEntryResponse:
    """RF-122: el autor actualiza la copia del catálogo con su versión actual."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    entry = await _get_entry_or_404(entry_id, club_id, db)
    if entry.published_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the original author can push updates")
    await push_changes_to_catalog(entry, db)
    await db.commit()
    return await _get_entry_or_404(entry_id, club_id, db)


@router.post("/{club_id}/catalog/{entry_id}/copy-to-library", response_model=dict)
async def copy_catalog_entry_to_library(
    club_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """RF-150: copia un drill del catálogo a la biblioteca personal del usuario."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    entry = await _get_entry_or_404(entry_id, club_id, db)
    new_drill = await copy_drill_to_library(entry, current_user.id, db)
    await db.commit()
    return {"drill_id": new_drill.id}


@router.patch("/{club_id}/catalog/{entry_id}/tags", response_model=CatalogEntryResponse)
async def update_catalog_entry_tags(
    club_id: int,
    entry_id: int,
    body: UpdateCatalogTagsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CatalogEntryResponse:
    """Actualiza los tags del club asociados a una entrada del catálogo (autor o TD)."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    entry = await _get_entry_or_404(entry_id, club_id, db)

    is_td = False
    try:
        await _require_technical_director(club_id, current_user, db)
        is_td = True
    except HTTPException:
        pass

    if entry.published_by != current_user.id and not is_td and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the author or TechnicalDirector can update tags")

    entry.tags = await _resolve_club_tags(body.tag_ids, club_id, db)
    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await _get_entry_or_404(entry_id, club_id, db)


@router.delete("/{club_id}/catalog/{entry_id}", status_code=204)
async def remove_from_catalog(
    club_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """RF-123: retirar drill del catálogo (autor o TechnicalDirector)."""
    await _get_club_or_404(club_id, db)
    await _require_club_access(club_id, current_user, db)
    entry = await _get_entry_or_404(entry_id, club_id, db)

    is_td = False
    try:
        await _require_technical_director(club_id, current_user, db)
        is_td = True
    except HTTPException:
        pass

    if entry.published_by != current_user.id and not is_td and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Only the author or TechnicalDirector can remove catalog entries")

    entry.archived_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)
