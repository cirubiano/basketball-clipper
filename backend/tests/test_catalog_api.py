"""
Tests de integración para el router de catálogo del club.

Cubre:
  - GET    /clubs/{id}/catalog/tags                       (list_club_tags)
  - POST   /clubs/{id}/catalog/tags                       (create_club_tag, TD only)
  - PATCH  /clubs/{id}/catalog/tags/{tag_id}              (update_club_tag, TD only)
  - DELETE /clubs/{id}/catalog/tags/{tag_id}              (archive_club_tag, TD only)
  - GET    /clubs/{id}/catalog                            (list_catalog)
  - POST   /clubs/{id}/catalog                            (publish_to_catalog, RF-120)
  - GET    /clubs/{id}/catalog/{entry_id}                 (get_catalog_entry)
  - POST   /clubs/{id}/catalog/{entry_id}/update-copy     (update_catalog_copy, RF-122)
  - POST   /clubs/{id}/catalog/{entry_id}/copy-to-library (copy_catalog_entry_to_library, RF-150)
  - PATCH  /clubs/{id}/catalog/{entry_id}/tags            (update_catalog_entry_tags)
  - DELETE /clubs/{id}/catalog/{entry_id}                 (remove_from_catalog, RF-123)

    docker compose run --rm backend pytest tests/test_catalog_api.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id)
    return {"Authorization": f"Bearer {token}"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = False
    return u


def _fake_admin(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = True
    return u


def _fake_club(club_id: int = 1) -> MagicMock:
    c = MagicMock()
    c.id = club_id
    c.archived_at = None
    return c


def _fake_club_tag(tag_id: int = 5, club_id: int = 1, archived: bool = False) -> MagicMock:
    t = MagicMock()
    t.id = tag_id
    t.club_id = club_id
    t.name = "Ataque"
    t.color = "#3B82F6"
    t.archived_at = _now() if archived else None
    t.created_at = _now()
    return t


def _fake_drill(drill_id: int = 99, user_id: int = 1, catalog_copy: bool = False, team_owned: bool = False) -> MagicMock:
    d = MagicMock()
    d.id = drill_id
    d.user_id = user_id
    d.title = "Pick and Roll"
    d.type = "drill"
    d.court_layout = "half_fiba"
    d.description = None
    d.root_sequence = None
    d.is_catalog_copy = catalog_copy
    d.is_team_owned = team_owned
    d.parent_id = None
    d.archived_at = None
    d.created_at = _now()
    d.updated_at = _now()
    d.tags = []
    d.variant_count = 0
    return d


def _fake_entry(entry_id: int = 7, club_id: int = 1, published_by: int = 1) -> MagicMock:
    e = MagicMock()
    e.id = entry_id
    e.club_id = club_id
    e.drill_id = 99
    e.original_drill_id = 99
    e.published_by = published_by
    e.archived_at = None
    e.created_at = _now()
    e.updated_at = _now()
    e.tags = []
    e.drill = _fake_drill()
    return e


def _fake_member_profile(user_id: int = 1, club_id: int = 1) -> MagicMock:
    p = MagicMock()
    p.user_id = user_id
    p.club_id = club_id
    p.archived_at = None
    return p


def _fake_td_profile(user_id: int = 1, club_id: int = 1) -> MagicMock:
    from app.models.profile import UserRole
    p = MagicMock()
    p.user_id = user_id
    p.club_id = club_id
    p.role = UserRole.technical_director
    p.team_id = None
    p.archived_at = None
    return p


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


# ── GET /clubs/{id}/catalog/tags ──────────────────────────────────────────────

def test_list_club_tags_empty():
    """Miembro del club puede listar tags vacío."""
    _override_user(_fake_admin())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/catalog/tags", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_club_tags_returns_tags():
    """Lista tags del club cuando existen."""
    _override_user(_fake_admin())
    tag = _fake_club_tag()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [tag]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/catalog/tags", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == 5
    assert data[0]["name"] == "Ataque"


def test_list_club_tags_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/catalog/tags")
    assert r.status_code == 401


def test_list_club_tags_club_not_found():
    """404 si el club no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/catalog/tags", headers=_auth_headers())
    assert r.status_code == 404


# ── POST /clubs/{id}/catalog/tags ─────────────────────────────────────────────

def test_create_club_tag_success():
    """TD puede crear un tag del club."""
    _override_user(_fake_admin())
    tag = _fake_club_tag()

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", 5) or setattr(obj, "created_at", _now()))

    # scalar for _require_technical_director check — admin skips it
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/catalog/tags",
        json={"name": "Ataque", "color": "#3B82F6"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201


def test_create_club_tag_non_td_forbidden():
    """Usuario sin rol TD recibe 403."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil TD
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/catalog/tags",
        json={"name": "Defensa"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


# ── PATCH /clubs/{id}/catalog/tags/{tag_id} ───────────────────────────────────

def test_update_club_tag_success():
    """TD puede actualizar un tag del club."""
    _override_user(_fake_admin())
    tag = _fake_club_tag()

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), tag])
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/catalog/tags/5",
        json={"name": "Defensa"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200


def test_update_club_tag_not_found():
    """404 si el tag no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), None])
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/catalog/tags/999",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_update_club_tag_archived():
    """409 si el tag ya está archivado."""
    _override_user(_fake_admin())
    tag = _fake_club_tag(archived=True)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), tag])
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/catalog/tags/5",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


# ── DELETE /clubs/{id}/catalog/tags/{tag_id} ──────────────────────────────────

def test_archive_club_tag_success():
    """TD puede archivar un tag del club."""
    _override_user(_fake_admin())
    tag = _fake_club_tag()

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), tag])
    session.commit = AsyncMock()
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/catalog/tags/5", headers=_auth_headers())
    assert r.status_code == 204
    assert tag.archived_at is not None


def test_archive_club_tag_already_archived():
    """409 si el tag ya está archivado."""
    _override_user(_fake_admin())
    tag = _fake_club_tag(archived=True)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), tag])
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/catalog/tags/5", headers=_auth_headers())
    assert r.status_code == 409


# ── GET /clubs/{id}/catalog ───────────────────────────────────────────────────

def test_list_catalog_empty():
    """Miembro del club puede ver el catálogo vacío."""
    _override_user(_fake_admin())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/catalog", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_catalog_returns_entries():
    """Devuelve entradas del catálogo cuando existen."""
    _override_user(_fake_admin())
    entry = _fake_entry()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [entry]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/catalog", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == 7


# ── POST /clubs/{id}/catalog ──────────────────────────────────────────────────

def test_publish_to_catalog_success():
    """Miembro puede publicar su propio drill al catálogo (RF-120)."""
    _override_user(_fake_admin())
    drill = _fake_drill(user_id=1)
    entry = _fake_entry()

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), drill])
    session.commit = AsyncMock()
    # _get_entry_or_404 uses session.execute for the re-fetch after commit
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock
    execute_mock.scalar_one_or_none = MagicMock(return_value=entry)
    session.execute = AsyncMock(return_value=execute_mock)
    session.scalar = AsyncMock(return_value=entry)
    _override_db(session)

    with patch("app.routers.catalog.create_catalog_copy", new_callable=AsyncMock, return_value=entry), \
         patch("app.routers.catalog._get_entry_or_404", new_callable=AsyncMock, return_value=entry):
        r = TestClient(app).post(
            "/clubs/1/catalog",
            json={"drill_id": 99, "tag_ids": []},
            headers=_auth_headers(),
        )
    assert r.status_code == 201


def test_publish_to_catalog_drill_not_found():
    """404 si el drill no existe o no es del usuario."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), None])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/catalog",
        json={"drill_id": 999, "tag_ids": []},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_publish_to_catalog_rejects_catalog_copy():
    """400 si se intenta publicar una copia de catálogo."""
    _override_user(_fake_admin())
    drill = _fake_drill(user_id=1, catalog_copy=True)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/catalog",
        json={"drill_id": 99, "tag_ids": []},
        headers=_auth_headers(),
    )
    assert r.status_code == 400


def test_publish_to_catalog_rejects_team_owned():
    """400 si se intenta publicar un drill de equipo."""
    _override_user(_fake_admin())
    drill = _fake_drill(user_id=1, team_owned=True)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/catalog",
        json={"drill_id": 99, "tag_ids": []},
        headers=_auth_headers(),
    )
    assert r.status_code == 400


# ── POST /clubs/{id}/catalog/{entry_id}/copy-to-library ───────────────────────

def test_copy_to_library_success():
    """Miembro puede copiar un drill del catálogo a su biblioteca (RF-150)."""
    _override_user(_fake_admin())
    entry = _fake_entry()
    new_drill = _fake_drill(drill_id=200)

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.commit = AsyncMock()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [entry]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    with patch("app.routers.catalog._get_entry_or_404", new_callable=AsyncMock, return_value=entry), \
         patch("app.routers.catalog.copy_drill_to_library", new_callable=AsyncMock, return_value=new_drill):
        r = TestClient(app).post(
            "/clubs/1/catalog/7/copy-to-library",
            headers=_auth_headers(),
        )
    assert r.status_code == 200
    assert r.json()["drill_id"] == 200


# ── DELETE /clubs/{id}/catalog/{entry_id} ─────────────────────────────────────

def test_remove_from_catalog_by_author():
    """El autor puede retirar su drill del catálogo (RF-123)."""
    _override_user(_fake_admin())
    entry = _fake_entry(published_by=1)

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.commit = AsyncMock()
    _override_db(session)

    with patch("app.routers.catalog._get_entry_or_404", new_callable=AsyncMock, return_value=entry):
        r = TestClient(app).delete("/clubs/1/catalog/7", headers=_auth_headers())
    assert r.status_code == 204
    assert entry.archived_at is not None


def test_remove_from_catalog_non_author_forbidden():
    """Usuario que no es autor ni TD recibe 403."""
    _override_user(_fake_user(user_id=2))
    entry = _fake_entry(published_by=1)  # publicado por user 1, no por user 2

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # no TD profile
    _override_db(session)

    with patch("app.routers.catalog._get_entry_or_404", new_callable=AsyncMock, return_value=entry):
        r = TestClient(app).delete("/clubs/1/catalog/7", headers=_auth_headers(user_id=2))
    assert r.status_code == 403


def test_remove_from_catalog_entry_not_found():
    """404 si la entrada no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    _override_db(session)

    with patch("app.routers.catalog._get_entry_or_404", new_callable=AsyncMock,
               side_effect=__import__("fastapi").HTTPException(status_code=404, detail="Catalog entry not found")):
        r = TestClient(app).delete("/clubs/1/catalog/999", headers=_auth_headers())
    assert r.status_code == 404


def test_remove_from_catalog_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).delete("/clubs/1/catalog/7")
    assert r.status_code == 401
