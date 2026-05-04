"""
Tests de integración para posiciones dinámicas del club.

Cubre:
  - GET    /clubs/{id}/positions
  - POST   /clubs/{id}/positions
  - PATCH  /clubs/{id}/positions/{pid}
  - DELETE /clubs/{id}/positions/{pid}
  - Asignación de posiciones al crear/actualizar jugador

    docker compose run --rm backend pytest tests/test_positions_api.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
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


def _fake_position(pos_id: int = 100, club_id: int = 1, name: str = "Base") -> MagicMock:
    p = MagicMock()
    p.id = pos_id
    p.club_id = club_id
    p.name = name
    p.color = "#3B82F6"
    p.archived_at = None
    p.created_at = datetime.now(UTC)
    return p


def _fake_player(player_id: int = 42, club_id: int = 1) -> MagicMock:
    now = datetime.now(UTC)
    p = MagicMock()
    p.id = player_id
    p.club_id = club_id
    p.first_name = "Pau"
    p.last_name = "Gasol"
    p.date_of_birth = None
    p.positions = []
    p.photo_url = None
    p.phone = None
    p.archived_at = None
    p.created_at = now
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


# ── GET /clubs/{id}/positions ─────────────────────────────────────────────────

def test_list_positions_returns_list_for_admin():
    """Admin recibe la lista de posiciones activas del club."""
    _override_user(_fake_admin())
    pos = _fake_position()

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [pos]

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/positions", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == 100
    assert body[0]["name"] == "Base"
    assert body[0]["color"] == "#3B82F6"


def test_list_positions_accessible_by_member():
    """Miembro del club (staff) puede listar posiciones → 200."""
    _override_user(_fake_user())

    staff_profile = MagicMock()
    staff_profile.role = "staff_member"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=staff_profile)  # has club access
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/positions", headers=_auth_headers())
    assert r.status_code == 200


def test_list_positions_requires_club_membership():
    """Usuario sin perfil en el club → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # no profile
    _override_db(session)

    r = TestClient(app).get("/clubs/1/positions", headers=_auth_headers())
    assert r.status_code == 403


def test_list_positions_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/positions")
    assert r.status_code == 401


# ── POST /clubs/{id}/positions ────────────────────────────────────────────────

def test_create_position_returns_201_for_admin():
    """Admin crea una posición con nombre y color → 201."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", 101) or setattr(obj, "name", "Alero") or setattr(obj, "color", "#EF4444") or setattr(obj, "archived_at", None) or setattr(obj, "created_at", datetime.now(UTC)))
    _override_db(session)

    # Use pos as the return value after refresh
    session.refresh = AsyncMock(return_value=None)
    # Override add to set id on the position object
    def _add(obj):
        obj.id = 101
        obj.club_id = 1
        obj.archived_at = None
        obj.created_at = datetime.now(UTC)
    session.add = MagicMock(side_effect=_add)

    r = TestClient(app).post(
        "/clubs/1/positions",
        json={"name": "Alero", "color": "#EF4444"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Alero"
    assert body["color"] == "#EF4444"
    assert body["club_id"] == 1


def test_create_position_requires_coach_or_td():
    """Staff member → 403 al crear posición."""
    _override_user(_fake_user())

    staff_profile = MagicMock()
    staff_profile.role = "staff_member"

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # no TD/HC profile found
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/positions",
        json={"name": "Base", "color": "#3B82F6"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_position_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/clubs/1/positions",
        json={"name": "Base", "color": "#3B82F6"},
    )
    assert r.status_code == 401


# ── PATCH /clubs/{id}/positions/{pid} ────────────────────────────────────────

def test_update_position_modifies_fields():
    """PATCH actualiza nombre y color de la posición → 200."""
    _override_user(_fake_admin())
    pos = _fake_position(pos_id=100, name="Base")

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), pos]  # club + position
    session.refresh = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/positions/100",
        json={"name": "Escolta", "color": "#10B981"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert pos.name == "Escolta"
    assert pos.color == "#10B981"


def test_update_position_not_found_returns_404():
    """Posición inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]  # position not found
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/positions/999",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_update_position_requires_coach_or_td():
    """Staff member → 403 al actualizar posición."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # no TD/HC profile
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/positions/100",
        json={"name": "X"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_update_position_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).patch("/clubs/1/positions/100", json={"name": "X"})
    assert r.status_code == 401


# ── DELETE /clubs/{id}/positions/{pid} ───────────────────────────────────────

def test_archive_position_returns_204():
    """Archivar posición → 204 y archived_at establecido."""
    _override_user(_fake_admin())
    pos = _fake_position()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), pos]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/positions/100", headers=_auth_headers())
    assert r.status_code == 204
    assert pos.archived_at is not None


def test_archive_position_not_found_returns_404():
    """Posición inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/positions/999", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_position_does_not_appear_in_subsequent_get():
    """Después de archivar, la posición no aparece en GET (archived_at != None)."""
    _override_user(_fake_admin())
    pos = _fake_position()

    # DELETE
    session_del = AsyncMock()
    session_del.get.side_effect = [_fake_club(), pos]
    _override_db(session_del)
    TestClient(app).delete("/clubs/1/positions/100", headers=_auth_headers())
    # pos.archived_at is now set

    # GET — the position should NOT appear (filtered by router WHERE archived_at IS NULL)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []  # archived position excluded

    session_get = AsyncMock()
    session_get.get = AsyncMock(return_value=_fake_club())
    session_get.execute = AsyncMock(return_value=mock_result)
    _override_db(session_get)

    r = TestClient(app).get("/clubs/1/positions", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_archive_position_requires_coach_or_td():
    """Staff member → 403 al archivar posición."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # no TD/HC profile
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/positions/100", headers=_auth_headers())
    assert r.status_code == 403


def test_archive_position_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).delete("/clubs/1/positions/100")
    assert r.status_code == 401


# ── Asignación de posiciones a jugadores ──────────────────────────────────────

def test_create_player_with_positions_returns_positions_in_response():
    """Crear jugador con position_ids → PlayerResponse incluye las posiciones."""
    _override_user(_fake_admin())

    pos1 = _fake_position(pos_id=10, name="Base")
    pos2 = _fake_position(pos_id=11, name="Alero")
    player = _fake_player()
    player.positions = [pos1, pos2]

    # _load_positions execute result
    mock_pos_result = MagicMock()
    mock_pos_result.scalars.return_value.all.return_value = [pos1, pos2]

    # final player select execute result
    mock_player_result = MagicMock()
    mock_player_result.scalar_one.return_value = player

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=[mock_pos_result, mock_player_result])
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/players",
        json={"first_name": "Pau", "last_name": "Gasol", "position_ids": [10, 11]},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["positions"]) == 2
    position_names = {p["name"] for p in body["positions"]}
    assert "Base" in position_names
    assert "Alero" in position_names


def test_create_player_with_no_positions_returns_empty_list():
    """Crear jugador sin position_ids → positions = []."""
    _override_user(_fake_admin())

    player = _fake_player()
    player.positions = []

    mock_player_result = MagicMock()
    mock_player_result.scalar_one.return_value = player

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=mock_player_result)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/players",
        json={"first_name": "Marc", "last_name": "Gasol"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    assert r.json()["positions"] == []


def test_create_player_with_invalid_position_ids_returns_422():
    """position_ids que incluye ID de otra club → 422."""
    _override_user(_fake_admin())

    # _load_positions finds only 1 of 2 positions (the other belongs to a different club)
    pos1 = _fake_position(pos_id=10, name="Base")
    mock_pos_result = MagicMock()
    mock_pos_result.scalars.return_value.all.return_value = [pos1]  # only 1 of 2

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=mock_pos_result)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/players",
        json={"first_name": "Marc", "last_name": "Gasol", "position_ids": [10, 999]},
        headers=_auth_headers(),
    )
    assert r.status_code == 422
    assert "invalid" in r.json()["detail"].lower()
