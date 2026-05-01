"""
Tests de integración para el router del playbook del equipo.

Cubre:
  - GET    /clubs/{id}/teams/{tid}/playbook           (list_playbook, RF-167)
  - POST   /clubs/{id}/teams/{tid}/playbook           (add_to_playbook, RF-160)
  - DELETE /clubs/{id}/teams/{tid}/playbook/{eid}     (remove_from_playbook, RF-166)

    docker compose run --rm backend pytest tests/test_playbook_api.py -v
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


def _fake_admin(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = True
    return u


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = False
    return u


def _fake_club(club_id: int = 1) -> MagicMock:
    c = MagicMock()
    c.id = club_id
    c.archived_at = None
    return c


def _fake_team(team_id: int = 10, club_id: int = 1) -> MagicMock:
    t = MagicMock()
    t.id = team_id
    t.club_id = club_id
    t.archived_at = None
    return t


def _fake_drill(drill_id: int = 99, user_id: int = 1) -> MagicMock:
    d = MagicMock()
    d.id = drill_id
    d.user_id = user_id
    d.archived_at = None
    d.is_catalog_copy = False
    d.is_team_owned = False
    d.title = "Pick and Roll"
    d.tags = []
    return d


def _fake_playbook_entry(entry_id: int = 7, team_id: int = 10) -> MagicMock:
    now = datetime.now(timezone.utc)
    e = MagicMock()
    e.id = entry_id
    e.team_id = team_id
    e.drill_id = 99
    e.added_by = 1
    e.archived_at = None
    e.created_at = now
    e.is_frozen = False
    e.frozen_at = None
    # Drill nested object for schema serialization
    drill = MagicMock()
    drill.id = 99
    drill.name = "Pick and Roll"
    drill.description = None
    drill.type = "drill"
    drill.court_layout = "full_fiba"
    drill.root_sequence = None
    drill.user_id = 1
    drill.archived_at = None
    drill.is_catalog_copy = False
    drill.is_team_owned = False
    drill.parent_id = None
    drill.created_at = now
    drill.updated_at = now
    drill.tags = []
    drill.variant_count = 0
    e.drill = drill
    return e


def _fake_profile(user_id: int = 1, team_id: int = 10) -> MagicMock:
    p = MagicMock()
    p.user_id = user_id
    p.team_id = team_id
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


# ── GET /clubs/{id}/teams/{tid}/playbook ──────────────────────────────────────

def test_list_playbook_admin_returns_empty():
    """Admin puede ver el playbook vacío."""
    _override_user(_fake_admin())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team()])
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_playbook_returns_entries():
    """Devuelve entradas del playbook cuando existen."""
    _override_user(_fake_admin())
    entry = _fake_playbook_entry()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [entry]
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team()])
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == 7


def test_list_playbook_team_not_found():
    """404 si el equipo no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), None])
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 404


def test_list_playbook_team_wrong_club():
    """404 si el equipo pertenece a otro club."""
    _override_user(_fake_admin())
    wrong_team = _fake_team(team_id=10, club_id=99)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), wrong_team])
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 404


def test_list_playbook_team_archived():
    """404 si el equipo está archivado."""
    _override_user(_fake_admin())
    archived_team = _fake_team()
    archived_team.archived_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), archived_team])
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 404


def test_list_playbook_no_team_access():
    """403 si el usuario no tiene perfil en el equipo."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team()])
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 403


def test_list_playbook_with_team_access():
    """Usuario con perfil en el equipo puede ver el playbook."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team()])
    session.scalar = AsyncMock(return_value=_fake_profile())  # tiene perfil
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 200


def test_list_playbook_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/teams/10/playbook")
    assert r.status_code == 401


def test_list_playbook_club_not_found():
    """404 si el club no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/clubs/99/teams/10/playbook", headers=_auth_headers())
    assert r.status_code == 404


# ── POST /clubs/{id}/teams/{tid}/playbook ─────────────────────────────────────

def test_add_to_playbook_success():
    """Añade un drill al playbook correctamente (RF-160)."""
    _override_user(_fake_admin())
    entry = _fake_playbook_entry()

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), _fake_drill()])
    # scalar calls: 1) existing-check → None, 2) _get_entry_or_404 → entry
    session.scalar = AsyncMock(side_effect=[None, entry])
    session.add = MagicMock()
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    assert r.json()["id"] == 7


def test_add_to_playbook_drill_not_found():
    """404 si el drill no existe en la biblioteca del usuario."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), None])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_add_to_playbook_drill_wrong_owner():
    """404 si el drill pertenece a otro usuario."""
    _override_user(_fake_admin())
    drill = _fake_drill(user_id=999)  # usuario diferente

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_add_to_playbook_drill_archived():
    """404 si el drill está archivado."""
    _override_user(_fake_admin())
    drill = _fake_drill()
    drill.archived_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_add_to_playbook_catalog_copy_rejected():
    """400 si se intenta añadir una copia del catálogo."""
    _override_user(_fake_admin())
    drill = _fake_drill()
    drill.is_catalog_copy = True

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 400


def test_add_to_playbook_team_owned_rejected():
    """400 si el drill es propiedad del equipo."""
    _override_user(_fake_admin())
    drill = _fake_drill()
    drill.is_team_owned = True

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), drill])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 400


def test_add_to_playbook_duplicate_rejected():
    """409 si el drill ya está en el playbook (RF-161)."""
    _override_user(_fake_admin())
    drill = _fake_drill()
    existing = _fake_playbook_entry()

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team(), drill])
    session.scalar = AsyncMock(return_value=existing)  # ya existe
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_add_to_playbook_no_team_access():
    """403 si el usuario no tiene perfil en el equipo."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[_fake_club(), _fake_team()])
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/playbook",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_add_to_playbook_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/clubs/1/teams/10/playbook", json={"drill_id": 99})
    assert r.status_code == 401


# ── DELETE /clubs/{id}/teams/{tid}/playbook/{eid} ─────────────────────────────

def test_remove_from_playbook_success():
    """Retira la entrada del playbook (soft-delete, RF-166)."""
    _override_user(_fake_admin())
    entry = _fake_playbook_entry()

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    # _require_team_access admin → skip; _get_entry_or_404 → entry
    session.scalar = AsyncMock(return_value=entry)
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/playbook/7",
        headers=_auth_headers(),
    )
    assert r.status_code == 204
    assert entry.archived_at is not None


def test_remove_from_playbook_entry_not_found():
    """404 si la entrada no existe en el playbook."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin entrada
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/playbook/99",
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_remove_from_playbook_no_team_access():
    """403 si el usuario no tiene acceso al equipo."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil → 403
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/playbook/7",
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_remove_from_playbook_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).delete("/clubs/1/teams/10/playbook/7")
    assert r.status_code == 401
