"""
Drills & Tags — biblioteca personal de ejercicios y jugadas.

Permisos (RF-126):
  - Cualquier usuario autenticado puede crear drills/plays en su biblioteca.
  - Solo el autor puede editar, archivar o clonar sus propios drills.
  - Leer el detalle de un drill es público para el autor (fases E+ amplían acceso).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.drill import Drill, DrillType, Tag, _default_root_sequence
from app.models.user import User
from app.schemas.drill import (
    DrillCreate,
    DrillFavoriteUpdate,
    DrillResponse,
    DrillSummaryResponse,
    DrillUpdate,
    TagCreate,
    TagResponse,
    TagUpdate,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_drill_or_404(drill_id: int, db: AsyncSession) -> Drill:
    stmt = (
        select(Drill)
        .options(selectinload(Drill.tags))
        .where(Drill.id == drill_id)
    )
    drill = await db.scalar(stmt)
    if drill is None:
        raise HTTPException(status_code=404, detail="Drill not found")
    return drill


async def _require_author(drill: Drill, user: User) -> None:
    if drill.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the author can modify this drill")


async def _resolve_tags(tag_ids: list[int], user_id: int, db: AsyncSession) -> list[Tag]:
    """Devuelve los tags del usuario para los ids dados; lanza 404 si alguno no existe."""
    if not tag_ids:
        return []
    result = await db.execute(
        select(Tag).where(
            Tag.id.in_(tag_ids),
            Tag.user_id == user_id,
            Tag.archived_at.is_(None),
        )
    )
    tags = result.scalars().all()
    if len(tags) != len(tag_ids):
        raise HTTPException(status_code=404, detail="One or more tags not found")
    return list(tags)


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TagResponse]:
    stmt = select(Tag).where(Tag.user_id == current_user.id)
    if not include_archived:
        stmt = stmt.where(Tag.archived_at.is_(None))
    stmt = stmt.order_by(Tag.name)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    body: TagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    tag = Tag(user_id=current_user.id, **body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    body: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TagResponse:
    tag = await db.get(Tag, tag_id)
    if tag is None or tag.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.archived_at is not None:
        raise HTTPException(status_code=409, detail="Cannot update an archived tag")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
async def archive_tag(
    tag_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    tag = await db.get(Tag, tag_id)
    if tag is None or tag.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag.archived_at is not None:
        raise HTTPException(status_code=409, detail="Tag is already archived")
    tag.archived_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=204)


# ── Drills / Plays ────────────────────────────────────────────────────────────

@router.get("", response_model=list[DrillSummaryResponse])
async def list_drills(
    type: DrillType | None = None,
    tag_id: int | None = None,
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DrillSummaryResponse]:
    """Lista la biblioteca personal del usuario autenticado."""
    stmt = (
        select(Drill)
        .options(selectinload(Drill.tags))
        .where(
            Drill.user_id == current_user.id,
            Drill.is_catalog_copy.is_(False),
            Drill.is_team_owned.is_(False),
        )
    )
    if type is not None:
        stmt = stmt.where(Drill.type == type)
    if tag_id is not None:
        stmt = stmt.where(Drill.tags.any(Tag.id == tag_id))
    if not include_archived:
        stmt = stmt.where(Drill.archived_at.is_(None))
    stmt = stmt.order_by(Drill.updated_at.desc())
    result = await db.execute(stmt)
    drills_list = result.scalars().all()

    # Count variants for each drill (children where parent_id = drill.id)
    variant_counts: dict[int, int] = {}
    if drills_list:
        drill_ids = [d.id for d in drills_list]
        count_result = await db.execute(
            select(Drill.parent_id, func.count(Drill.id).label("cnt"))
            .where(
                Drill.parent_id.in_(drill_ids),
                Drill.archived_at.is_(None),
            )
            .group_by(Drill.parent_id)
        )
        for row in count_result:
            variant_counts[row.parent_id] = row.cnt

    return [
        DrillSummaryResponse.model_validate(d).model_copy(
            update={"variant_count": variant_counts.get(d.id, 0)}
        )
        for d in drills_list
    ]


@router.post("", response_model=DrillResponse, status_code=201)
async def create_drill(
    body: DrillCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    tags = await _resolve_tags(body.tag_ids, current_user.id, db)
    drill = Drill(
        user_id=current_user.id,
        type=body.type,
        name=body.name,
        court_layout=body.court_layout,
        description=body.description,
        root_sequence=_default_root_sequence(),
    )
    drill.tags = tags
    db.add(drill)
    await db.flush()
    await db.commit()
    return await _get_drill_or_404(drill.id, db)


@router.get("/{drill_id}", response_model=DrillResponse)
async def get_drill(
    drill_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    drill = await _get_drill_or_404(drill_id, db)
    # Por ahora solo el autor puede ver su drill (fases E+ amplían esto)
    await _require_author(drill, current_user)
    return drill


@router.patch("/{drill_id}", response_model=DrillResponse)
async def update_drill(
    drill_id: int,
    body: DrillUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    drill = await _get_drill_or_404(drill_id, db)
    await _require_author(drill, current_user)
    if drill.archived_at is not None:
        raise HTTPException(status_code=409, detail="Cannot update an archived drill")

    data = body.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)

    for field, value in data.items():
        setattr(drill, field, value)

    if tag_ids is not None:
        drill.tags = await _resolve_tags(tag_ids, current_user.id, db)

    drill.updated_at = datetime.now(UTC)
    await db.commit()
    return await _get_drill_or_404(drill_id, db)


@router.delete("/{drill_id}", status_code=204)
async def archive_drill(
    drill_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    drill = await _get_drill_or_404(drill_id, db)
    await _require_author(drill, current_user)
    if drill.archived_at is not None:
        raise HTTPException(status_code=409, detail="Drill is already archived")
    drill.archived_at = datetime.now(UTC)
    await db.commit()
    return Response(status_code=204)


@router.patch("/{drill_id}/favorite", response_model=DrillResponse)
async def set_favorite(
    drill_id: int,
    body: DrillFavoriteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    """RF-550 — marca o desmarca un drill como favorito personal."""
    drill = await _get_drill_or_404(drill_id, db)
    await _require_author(drill, current_user)
    drill.is_favorite = body.is_favorite
    await db.commit()
    return await _get_drill_or_404(drill_id, db)


@router.post("/{drill_id}/clone", response_model=DrillResponse, status_code=201)
async def clone_drill(
    drill_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    """
    RF-151 — clona un drill dentro de la biblioteca personal del usuario.
    La copia es una nueva entidad con nuevo id y mismo autor.
    """
    source = await _get_drill_or_404(drill_id, db)
    await _require_author(source, current_user)

    import copy
    clone = Drill(
        user_id=current_user.id,
        type=source.type,
        name=f"{source.name} (copia)",
        court_layout=source.court_layout,
        description=source.description,
        root_sequence=copy.deepcopy(source.root_sequence),
    )
    # Reasignar nuevos IDs a todos los nodos del árbol clonado
    _reassign_node_ids(clone.root_sequence)
    clone.tags = list(source.tags)
    db.add(clone)
    await db.flush()
    await db.commit()
    return await _get_drill_or_404(clone.id, db)


def _reassign_node_ids(node: dict) -> None:
    """Recorre el árbol de secuencias y asigna nuevos UUIDs a cada nodo."""
    node["id"] = str(uuid.uuid4())
    for branch in node.get("branches", []):
        _reassign_node_ids(branch)


@router.post("/{drill_id}/variants", response_model=DrillResponse, status_code=201)
async def create_variant(
    drill_id: int,
    body: DrillCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DrillResponse:
    """
    RF-140 — crea una variante del drill dado. La variante es un drill nuevo
    con parent_id apuntando al padre.
    """
    parent = await _get_drill_or_404(drill_id, db)
    await _require_author(parent, current_user)

    tags = await _resolve_tags(body.tag_ids, current_user.id, db)
    variant = Drill(
        user_id=current_user.id,
        type=body.type,
        name=body.name,
        court_layout=body.court_layout,
        description=body.description,
        root_sequence=_default_root_sequence(),
        parent_id=drill_id,
    )
    variant.tags = tags
    db.add(variant)
    await db.flush()
    await db.commit()
    return await _get_drill_or_404(variant.id, db)
