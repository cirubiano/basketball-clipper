"""
Tests de integración para el router de drills y tags.

Cubre:
  - GET    /drills/tags              (list_tags)
  - POST   /drills/tags              (create_tag)
  - PATCH  /drills/tags/{id}         (update_tag)
  - DELETE /drills/tags/{id}         (archive_tag)
  - GET    /drills                   (list_drills, con variant_count)
  - POST   /drills                   (create_drill)
  - GET    /drills/{id}              (get_drill)
  - PATCH  /drills/{id}              (update_drill)
  - DELETE /drills/{id}              (archive_drill)
  - POST   /drills/{id}/clone        (clone_drill, RF-151)
  - POST   /drills/{id}/variants     (create_variant, RF-140)

    docker compose run --rm backend pytest tests/test_drills_api.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id)
    return {"Authorization": f"Bearer {token}"}


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = False
    return u


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fake_tag(tag_id: int = 1, user_id: int = 1, archived: bool = False) -> MagicMock:
    t = MagicMock()
    t.id = tag_id
    t.user_id = user_id
    t.name = "Defensa"
    t.color = "#FF0000"
    t.archived_at = _now() if archived else None
    t.created_at = _now()
    return t


def _fake_drill(
    drill_id: int = 10,
    user_id: int = 1,
    archived: bool = False,
    parent_id: int | None = None,
) -> MagicMock:
    now = _now()
    d = MagicMock()
    d.id = drill_id
    d.user_id = user_id
    d.type = "drill"
    d.name = "Bloqueo directo"
    d.court_layout = "half_fiba"
    d.description = None
    d.root_sequence = {"id": "root", "action": None, "branches": []}
    d.parent_id = parent_id
    d.archived_at = now if archived else None
    d.created_at = now
    d.updated_at = now
    d.is_catalog_copy = False
    d.is_team_owned = False
    d.tags = []
    d.variant_count = 0
    return d


def _override_user(user: MagicMock) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _override_db(session: AsyncMock) -> None:
    async def _dep():
        yield session
    app.dependency_overrides[get_db] = _dep


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── GET /drills/tags ──────────────────────────────────────────────────────────

def test_list_tags_returns_empty():
    """Lista vacía cuando el usuario no tiene tags."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/drills/tags", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_tags_returns_tags():
    """Devuelve los tags del usuario."""
    _override_user(_fake_user())
    tag = _fake_tag()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [tag]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/drills/tags", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == 1


def test_list_tags_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/drills/tags")
    assert r.status_code == 401


# ── POST /drills/tags ─────────────────────────────────────────────────────────

def test_create_tag_success():
    """Crea un tag correctamente."""
    _override_user(_fake_user())
    tag = _fake_tag()

    session = AsyncMock()
    session.add = MagicMock()

    async def _refresh(obj):
        obj.id = 1
        obj.created_at = _now()
        obj.archived_at = None
        obj.user_id = 1
        obj.name = "Defensa"
        obj.color = "#FF0000"

    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).post(
        "/drills/tags",
        json={"name": "Defensa", "color": "#FF0000"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Defensa"


def test_create_tag_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/drills/tags", json={"name": "test"})
    assert r.status_code == 401


# ── PATCH /drills/tags/{id} ───────────────────────────────────────────────────

def test_update_tag_success():
    """Actualiza el nombre de un tag."""
    _override_user(_fake_user())
    tag = _fake_tag()

    session = AsyncMock()
    session.get = AsyncMock(return_value=tag)

    async def _refresh(obj):
        pass  # fields already on obj

    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/tags/1",
        json={"name": "Ataque"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert tag.name == "Ataque"


def test_update_tag_not_found():
    """404 si el tag no existe o pertenece a otro usuario."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/tags/99",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_update_tag_wrong_owner():
    """404 si el tag pertenece a otro usuario."""
    _override_user(_fake_user(user_id=1))
    tag = _fake_tag(user_id=999)

    session = AsyncMock()
    session.get = AsyncMock(return_value=tag)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/tags/1",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_update_tag_archived_returns_409():
    """409 si el tag está archivado."""
    _override_user(_fake_user())
    tag = _fake_tag(archived=True)

    session = AsyncMock()
    session.get = AsyncMock(return_value=tag)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/tags/1",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


# ── DELETE /drills/tags/{id} ──────────────────────────────────────────────────

def test_archive_tag_success():
    """Archiva el tag del usuario."""
    _override_user(_fake_user())
    tag = _fake_tag()

    session = AsyncMock()
    session.get = AsyncMock(return_value=tag)
    _override_db(session)

    r = TestClient(app).delete("/drills/tags/1", headers=_auth_headers())
    assert r.status_code == 204
    assert tag.archived_at is not None


def test_archive_tag_not_found():
    """404 si el tag no existe."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).delete("/drills/tags/99", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_tag_already_archived():
    """409 si el tag ya está archivado."""
    _override_user(_fake_user())
    tag = _fake_tag(archived=True)

    session = AsyncMock()
    session.get = AsyncMock(return_value=tag)
    _override_db(session)

    r = TestClient(app).delete("/drills/tags/1", headers=_auth_headers())
    assert r.status_code == 409


# ── GET /drills ───────────────────────────────────────────────────────────────

def test_list_drills_empty():
    """Lista vacía cuando el usuario no tiene drills."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/drills", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_drills_with_results_and_variant_counts():
    """Devuelve drills con variant_count calculado."""
    _override_user(_fake_user())
    drill = _fake_drill()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [drill]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    # count_result row
    count_row = MagicMock()
    count_row.parent_id = 10
    count_row.cnt = 2
    count_execute_mock = MagicMock()
    count_execute_mock.__iter__ = MagicMock(return_value=iter([count_row]))

    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[execute_mock, count_execute_mock])
    _override_db(session)

    r = TestClient(app).get("/drills", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["variant_count"] == 2


def test_list_drills_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/drills")
    assert r.status_code == 401


# ── POST /drills ──────────────────────────────────────────────────────────────

def test_create_drill_success():
    """Crea un drill correctamente."""
    _override_user(_fake_user())
    drill = _fake_drill()

    # _resolve_tags called with empty tag_ids → returns []
    # Then _get_drill_or_404 → db.scalar → drill
    session = AsyncMock()
    session.add = MagicMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).post(
        "/drills",
        json={"type": "drill", "name": "Bloqueo", "court_layout": "half_fiba"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"] == 10


def test_create_drill_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/drills",
        json={"type": "drill", "name": "X", "court_layout": "half_fiba"},
    )
    assert r.status_code == 401


# ── GET /drills/{id} ──────────────────────────────────────────────────────────

def test_get_drill_success():
    """El autor puede ver su drill."""
    _override_user(_fake_user())
    drill = _fake_drill()

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).get("/drills/10", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json()["id"] == 10


def test_get_drill_not_found():
    """404 si el drill no existe."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/drills/99", headers=_auth_headers())
    assert r.status_code == 404


def test_get_drill_not_author():
    """403 si el usuario no es el autor."""
    _override_user(_fake_user(user_id=1))
    drill = _fake_drill(user_id=999)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).get("/drills/10", headers=_auth_headers())
    assert r.status_code == 403


# ── PATCH /drills/{id} ────────────────────────────────────────────────────────

def test_update_drill_success():
    """Actualiza el nombre del drill."""
    _override_user(_fake_user())
    drill = _fake_drill()
    updated_drill = _fake_drill()
    updated_drill.name = "Nuevo nombre"

    session = AsyncMock()
    # First call: _get_drill_or_404 → drill; second call after update: _get_drill_or_404 → updated_drill
    session.scalar = AsyncMock(side_effect=[drill, updated_drill])
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/10",
        json={"name": "Nuevo nombre"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Nuevo nombre"


def test_update_drill_archived_returns_409():
    """409 si el drill está archivado."""
    _override_user(_fake_user())
    drill = _fake_drill(archived=True)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/10",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_update_drill_not_author():
    """403 si el usuario no es el autor."""
    _override_user(_fake_user(user_id=1))
    drill = _fake_drill(user_id=999)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/10",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


# ── DELETE /drills/{id} ───────────────────────────────────────────────────────

def test_archive_drill_success():
    """Archiva el drill del autor."""
    _override_user(_fake_user())
    drill = _fake_drill()

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).delete("/drills/10", headers=_auth_headers())
    assert r.status_code == 204
    assert drill.archived_at is not None


def test_archive_drill_not_found():
    """404 si el drill no existe."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).delete("/drills/99", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_drill_already_archived():
    """409 si el drill ya está archivado."""
    _override_user(_fake_user())
    drill = _fake_drill(archived=True)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).delete("/drills/10", headers=_auth_headers())
    assert r.status_code == 409


def test_archive_drill_not_author():
    """403 si el usuario no es el autor."""
    _override_user(_fake_user(user_id=1))
    drill = _fake_drill(user_id=999)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).delete("/drills/10", headers=_auth_headers())
    assert r.status_code == 403


# ── POST /drills/{id}/clone ───────────────────────────────────────────────────

def test_clone_drill_success():
    """Clona el drill del autor en su biblioteca (RF-151)."""
    _override_user(_fake_user())
    source = _fake_drill()
    source.root_sequence = {"id": "root", "action": None, "branches": []}
    clone = _fake_drill(drill_id=11)
    clone.name = "Bloqueo directo (copia)"

    session = AsyncMock()
    # First scalar: source drill; second: cloned drill (returned by _get_drill_or_404)
    session.scalar = AsyncMock(side_effect=[source, clone])
    session.add = MagicMock()
    _override_db(session)

    r = TestClient(app).post("/drills/10/clone", headers=_auth_headers())
    assert r.status_code == 201
    assert r.json()["id"] == 11


def test_clone_drill_not_author():
    """403 si el usuario no es el autor del drill original."""
    _override_user(_fake_user(user_id=1))
    drill = _fake_drill(user_id=999)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=drill)
    _override_db(session)

    r = TestClient(app).post("/drills/10/clone", headers=_auth_headers())
    assert r.status_code == 403


# ── POST /drills/{id}/variants ────────────────────────────────────────────────

def test_create_variant_success():
    """Crea una variante del drill padre (RF-140)."""
    _override_user(_fake_user())
    parent = _fake_drill()
    variant = _fake_drill(drill_id=20, parent_id=10)

    session = AsyncMock()
    # scalar calls: _get_drill_or_404 (parent), then _get_drill_or_404 (created variant)
    session.scalar = AsyncMock(side_effect=[parent, variant])
    session.add = MagicMock()
    _override_db(session)

    r = TestClient(app).post(
        "/drills/10/variants",
        json={"type": "drill", "name": "Variante A", "court_layout": "half_fiba"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"] == 20
    assert data["parent_id"] == 10


def test_create_variant_parent_not_found():
    """404 si el drill padre no existe."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).post(
        "/drills/99/variants",
        json={"type": "drill", "name": "V", "court_layout": "half_fiba"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_create_variant_not_author():
    """403 si el usuario no es el autor del drill padre."""
    _override_user(_fake_user(user_id=1))
    parent = _fake_drill(user_id=999)

    session = AsyncMock()
    session.scalar = AsyncMock(return_value=parent)
    _override_db(session)

    r = TestClient(app).post(
        "/drills/10/variants",
        json={"type": "drill", "name": "V", "court_layout": "half_fiba"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


# ── Additional coverage: _resolve_tags error, filters, branches ───────────────

def test_create_drill_with_invalid_tag():
    """404 si algun tag_id no existe o pertenece a otro usuario."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).post(
        "/drills",
        json={"type": "drill", "name": "X", "court_layout": "half_fiba", "tag_ids": [99]},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_list_drills_with_type_filter():
    """Filtra por tipo de drill."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/drills?type=drill", headers=_auth_headers())
    assert r.status_code == 200


def test_list_drills_with_tag_filter():
    """Filtra por tag_id."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/drills?tag_id=1", headers=_auth_headers())
    assert r.status_code == 200


def test_update_drill_with_tag_ids():
    """Actualiza los tags del drill."""
    _override_user(_fake_user())
    drill = _fake_drill()
    updated_drill = _fake_drill()

    tag = _fake_tag()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [tag]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[drill, updated_drill])
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).patch(
        "/drills/10",
        json={"tag_ids": [1]},
        headers=_auth_headers(),
    )
    assert r.status_code == 200


def test_clone_drill_with_branches():
    """Clona drill con nodos de secuencia anidados (_reassign_node_ids recursivo)."""
    _override_user(_fake_user())
    source = _fake_drill()
    source.root_sequence = {
        "id": "root",
        "action": None,
        "branches": [
            {"id": "child1", "action": "pass", "branches": []},
        ],
    }
    clone = _fake_drill(drill_id=11)
    clone.name = "Bloqueo directo (copia)"

    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[source, clone])
    session.add = MagicMock()
    _override_db(session)

    r = TestClient(app).post("/drills/10/clone", headers=_auth_headers())
    assert r.status_code == 201
