"""
Lógica de negocio para el catálogo del club y el playbook del equipo.

Funciones exportadas:
  - create_catalog_copy        → publica copia de drill al catálogo (RF-120)
  - copy_drill_to_library      → copia un drill del catálogo a biblioteca personal (RF-150)
  - push_changes_to_catalog    → actualiza copia del catálogo con versión del autor (RF-122)
  - freeze_playbook_entries    → congela entradas al perder perfil en equipo (RF-164)
  - break_catalog_references   → rompe referencias al perder todos los perfiles del club (RF-124)
"""
from __future__ import annotations

import copy
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import ClubCatalogEntry
from app.models.club_tag import ClubTag
from app.models.drill import Drill
from app.models.playbook import TeamPlaybookEntry
from app.models.profile import Profile


def _reassign_node_ids(node: dict) -> None:
    node["id"] = str(uuid.uuid4())
    for branch in node.get("branches", []):
        _reassign_node_ids(branch)


async def create_catalog_copy(
    original: Drill,
    publisher_user_id: int,
    club_id: int,
    tag_ids: list[int],
    db: AsyncSession,
) -> ClubCatalogEntry:
    """
    RF-120: publica una copia del drill en el catálogo del club.
    Crea un nuevo Drill con is_catalog_copy=True y lo vincula en ClubCatalogEntry.
    """
    # Verificar que no esté ya publicado por el mismo usuario en este club
    existing = await db.scalar(
        select(ClubCatalogEntry).where(
            ClubCatalogEntry.club_id == club_id,
            ClubCatalogEntry.original_drill_id == original.id,
            ClubCatalogEntry.archived_at.is_(None),
        )
    )
    if existing is not None:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="This drill is already published to the catalog")

    seq_copy = copy.deepcopy(original.root_sequence)
    _reassign_node_ids(seq_copy)

    catalog_drill = Drill(
        user_id=publisher_user_id,
        type=original.type,
        name=original.name,
        court_layout=original.court_layout,
        description=original.description,
        root_sequence=seq_copy,
        is_catalog_copy=True,
    )
    db.add(catalog_drill)
    await db.flush()

    tags = await _resolve_club_tags(tag_ids, club_id, db)
    entry = ClubCatalogEntry(
        club_id=club_id,
        drill_id=catalog_drill.id,
        original_drill_id=original.id,
        published_by=publisher_user_id,
    )
    entry.tags = tags
    db.add(entry)
    await db.flush()
    return entry


async def copy_drill_to_library(
    catalog_entry: ClubCatalogEntry,
    target_user_id: int,
    db: AsyncSession,
) -> Drill:
    """
    RF-150: copia un drill del catálogo a la biblioteca personal del usuario.
    Crea una nueva entidad con nuevo id y el usuario como autor.
    """
    source = catalog_entry.drill
    seq_copy = copy.deepcopy(source.root_sequence)
    _reassign_node_ids(seq_copy)

    new_drill = Drill(
        user_id=target_user_id,
        type=source.type,
        name=source.name,
        court_layout=source.court_layout,
        description=source.description,
        root_sequence=seq_copy,
    )
    db.add(new_drill)
    await db.flush()
    return new_drill


async def push_changes_to_catalog(
    catalog_entry: ClubCatalogEntry,
    db: AsyncSession,
) -> ClubCatalogEntry:
    """
    RF-122: actualiza la copia del catálogo con el estado actual del original.
    Solo puede hacerlo el autor (verificar en el router).
    """
    if catalog_entry.original_drill_id is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="No original drill linked to update from")

    original = await db.get(Drill, catalog_entry.original_drill_id)
    if original is None or original.archived_at is not None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Original drill not found or archived")

    catalog_drill = await db.get(Drill, catalog_entry.drill_id)
    if catalog_drill is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Catalog copy not found")

    seq_copy = copy.deepcopy(original.root_sequence)
    _reassign_node_ids(seq_copy)

    catalog_drill.name = original.name
    catalog_drill.court_layout = original.court_layout
    catalog_drill.description = original.description
    catalog_drill.root_sequence = seq_copy
    catalog_drill.updated_at = datetime.now(UTC)

    catalog_entry.updated_at = datetime.now(UTC)
    await db.flush()
    return catalog_entry


async def freeze_playbook_entries(
    user_id: int,
    team_id: int,
    db: AsyncSession,
) -> None:
    """
    RF-164: cuando un usuario pierde su perfil en un equipo, las entradas que
    aportó al playbook se transforman en copias congeladas propiedad del equipo.
    """
    stmt = select(TeamPlaybookEntry).where(
        TeamPlaybookEntry.team_id == team_id,
        TeamPlaybookEntry.added_by == user_id,
        TeamPlaybookEntry.is_frozen.is_(False),
        TeamPlaybookEntry.archived_at.is_(None),
    )
    entries = (await db.scalars(stmt)).all()

    for entry in entries:
        original = await db.get(Drill, entry.drill_id)
        if original is None:
            continue

        seq_copy = copy.deepcopy(original.root_sequence)
        _reassign_node_ids(seq_copy)

        frozen_drill = Drill(
            user_id=user_id,
            type=original.type,
            name=original.name,
            court_layout=original.court_layout,
            description=original.description,
            root_sequence=seq_copy,
            is_team_owned=True,
            owned_team_id=team_id,
        )
        db.add(frozen_drill)
        await db.flush()

        entry.drill_id = frozen_drill.id
        entry.is_frozen = True
        entry.frozen_at = datetime.now(UTC)

    await db.flush()


async def freeze_all_club_playbook_entries(
    user_id: int,
    club_id: int,
    db: AsyncSession,
) -> None:
    """
    RF-164 (variante TD): cuando el usuario pierde todos sus perfiles en el club,
    congela sus entradas en todos los equipos del club.
    """
    from app.models.team import Team  # noqa: PLC0415

    remaining = await db.scalar(
        select(Profile).where(
            Profile.user_id == user_id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
        )
    )
    if remaining is not None:
        return  # Todavía tiene perfiles activos en el club

    team_ids_result = await db.execute(
        select(Team.id).where(Team.club_id == club_id, Team.archived_at.is_(None))
    )
    for (team_id,) in team_ids_result:
        await freeze_playbook_entries(user_id, team_id, db)


async def break_catalog_references(
    user_id: int,
    club_id: int,
    db: AsyncSession,
) -> None:
    """
    RF-124: cuando el usuario pierde todos sus perfiles en el club, se rompe la
    referencia entre sus originales y las copias del catálogo.
    La copia sigue existiendo; solo se desvincula del original.
    """
    remaining = await db.scalar(
        select(Profile).where(
            Profile.user_id == user_id,
            Profile.club_id == club_id,
            Profile.archived_at.is_(None),
        )
    )
    if remaining is not None:
        return  # Todavía tiene perfiles activos en el club

    stmt = select(ClubCatalogEntry).where(
        ClubCatalogEntry.club_id == club_id,
        ClubCatalogEntry.published_by == user_id,
        ClubCatalogEntry.original_drill_id.isnot(None),
        ClubCatalogEntry.archived_at.is_(None),
    )
    entries = (await db.scalars(stmt)).all()
    for entry in entries:
        entry.original_drill_id = None
    await db.flush()


async def _resolve_club_tags(
    tag_ids: list[int],
    club_id: int,
    db: AsyncSession,
) -> list[ClubTag]:
    if not tag_ids:
        return []
    result = await db.execute(
        select(ClubTag).where(
            ClubTag.id.in_(tag_ids),
            ClubTag.club_id == club_id,
            ClubTag.archived_at.is_(None),
        )
    )
    tags = result.scalars().all()
    if len(tags) != len(tag_ids):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="One or more club tags not found")
    return list(tags)
