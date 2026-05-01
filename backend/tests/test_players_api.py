"""
Tests de integración para los endpoints de jugadores y plantilla.

Cubre:
  - GET /clubs/{id}/players           — acceso, listado
  - POST /clubs/{id}/players          — permisos, creación
  - PATCH /clubs/{id}/players/{pid}   — actualización, jugador archivado
  - DELETE /clubs/{id}/players/{pid}  — soft-delete + cascade RF-090
  - GET /clubs/{id}/teams/{tid}/roster
  - POST /clubs/{id}/teams/{tid}/roster
  - PATCH /clubs/{id}/teams/{tid}/roster/{eid}
  - DELETE /clubs/{id}/teams/{tid}/roster/{eid}

    docker compose run --rm backend pytest tests/test_players_api.py -v
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


def _fake_team(team_id: int = 10, club_id: int = 1, season_id: int = 5) -> MagicMock:
    t = MagicMock()
    t.id = team_id
    t.club_id = club_id
    t.season_id = season_id
    t.archived_at = None
    return t


def _fake_player(player_id: int = 42, club_id: int = 1) -> MagicMock:
    now = datetime.now(timezone.utc)
    p = MagicMock()
    p.id = player_id
    p.club_id = club_id
    p.first_name = "Pau"
    p.last_name = "Gasol"
    p.date_of_birth = None
    p.positions = []  # M2M dynamic positions (replaces position enum)
    p.photo_url = None
    p.phone = None
    p.archived_at = None
    p.created_at = now
    return p


def _fake_roster_entry(entry_id: int = 1, player_id: int = 42, team_id: int = 10) -> MagicMock:
    now = datetime.now(timezone.utc)
    e = MagicMock()
    e.id = entry_id
    e.player_id = player_id
    e.team_id = team_id
    e.season_id = 5
    e.jersey_number = 16
    e.position = "center"
    e.points_per_game = None
    e.rebounds_per_game = None
    e.assists_per_game = None
    e.minutes_per_game = None
    e.archived_at = None
    e.created_at = now
    e.player = _fake_player(player_id)
    return e


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


# ── GET /clubs/{id}/players ───────────────────────────────────────────────────

def test_list_players_requires_club_access():
    """Sin perfil en el club → 403."""
    _override_user(_fake_user())
    club = _fake_club()
    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.scalar = AsyncMock(return_value=None)  # ningún perfil activo
    _override_db(session)

    r = TestClient(app).get("/clubs/1/players", headers=_auth_headers())
    assert r.status_code == 403


def test_list_players_returns_list_for_admin():
    """Admin recibe la lista de jugadores del club."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [player]

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/players", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == 42
    assert body[0]["first_name"] == "Pau"
    assert body[0]["last_name"] == "Gasol"


# ── POST /clubs/{id}/players ──────────────────────────────────────────────────

def test_create_player_requires_manage_role():
    """Usuario sin rol de gestión → 403."""
    _override_user(_fake_user())
    club = _fake_club()
    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.scalar = AsyncMock(return_value=None)  # sin perfil TD/HC
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/players",
        json={"first_name": "Marc", "last_name": "Gasol"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_player_by_admin_returns_201():
    """Admin crea un jugador correctamente."""
    _override_user(_fake_admin())
    player = _fake_player()

    mock_result = MagicMock()
    mock_result.scalar_one.return_value = player

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/players",
        json={"first_name": "Pau", "last_name": "Gasol"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == 42
    assert body["first_name"] == "Pau"
    assert body["positions"] == []


# ── PATCH /clubs/{id}/players/{pid} ──────────────────────────────────────────

def test_update_player_modifies_fields():
    """PATCH actualiza los campos enviados en el body."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = player
    mock_result.scalar_one.return_value = player

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/players/42",
        json={"first_name": "Marc"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert player.first_name == "Marc"


def test_update_archived_player_returns_409():
    """No se puede actualizar un jugador archivado."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()
    player.archived_at = datetime.now(timezone.utc)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = player

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/players/42",
        json={"first_name": "Marc"},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


# ── DELETE /clubs/{id}/players/{pid} (RF-090) ─────────────────────────────────

def test_archive_player_returns_204():
    """Archivar un jugador devuelve 204 y establece archived_at."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []  # sin entradas de plantilla

    session = AsyncMock()
    session.get.side_effect = [club, player]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/players/42", headers=_auth_headers())
    assert r.status_code == 204
    assert player.archived_at is not None


def test_archive_player_cascades_to_roster_entries():
    """RF-090: archivar jugador archiva también todas sus entradas de plantilla activas."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()
    entry = MagicMock()
    entry.archived_at = None

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [entry]

    session = AsyncMock()
    session.get.side_effect = [club, player]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/players/42", headers=_auth_headers())
    assert r.status_code == 204
    assert entry.archived_at is not None  # cascade RF-090


def test_archive_already_archived_player_returns_409():
    """No se puede archivar un jugador ya archivado."""
    _override_user(_fake_admin())
    club = _fake_club()
    player = _fake_player()
    player.archived_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get.side_effect = [club, player]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/players/42", headers=_auth_headers())
    assert r.status_code == 409


# ── GET /clubs/{id}/teams/{tid}/roster ────────────────────────────────────────

def test_list_roster_requires_club_access():
    """Sin perfil en el club → 403."""
    _override_user(_fake_user())
    club = _fake_club()
    team = _fake_team()

    session = AsyncMock()
    session.get.side_effect = [club, team]
    session.scalar = AsyncMock(return_value=None)  # sin perfil activo
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/roster", headers=_auth_headers())
    assert r.status_code == 403


def test_list_roster_returns_entries_for_admin():
    """Admin recibe la plantilla del equipo con datos del jugador embebidos."""
    _override_user(_fake_admin())
    entry = _fake_roster_entry()

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [entry]

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/roster", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["jersey_number"] == 16
    assert body[0]["player"]["first_name"] == "Pau"


# ── POST /clubs/{id}/teams/{tid}/roster ───────────────────────────────────────

def test_add_to_roster_creates_entry():
    """Admin añade un jugador a la plantilla correctamente."""
    _override_user(_fake_admin())
    team = _fake_team()
    player = _fake_player()
    entry = _fake_roster_entry()

    mock_result = MagicMock()
    mock_result.scalar_one.return_value = entry

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), team, player]
    session.scalar = AsyncMock(return_value=None)  # sin duplicado
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/roster",
        json={"player_id": 42, "jersey_number": 16},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["jersey_number"] == 16
    assert body["player"]["last_name"] == "Gasol"


def test_add_to_roster_duplicate_returns_409():
    """Añadir el mismo jugador dos veces al mismo equipo → 409."""
    _override_user(_fake_admin())
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar = AsyncMock(return_value=MagicMock())  # entrada existente
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/roster",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_add_to_roster_archived_player_returns_404():
    """Añadir un jugador archivado a la plantilla → 404."""
    _override_user(_fake_admin())
    player = _fake_player()
    player.archived_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/roster",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── PATCH /clubs/{id}/teams/{tid}/roster/{eid} ────────────────────────────────

def test_update_roster_entry_updates_stats():
    """PATCH actualiza estadísticas de una entrada de plantilla."""
    _override_user(_fake_admin())
    entry = _fake_roster_entry()

    mock_result = MagicMock()
    mock_result.scalar_one.return_value = entry

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), entry]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/roster/1",
        json={"points_per_game": 18.5, "jersey_number": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert entry.points_per_game == 18.5
    assert entry.jersey_number == 3


# ── DELETE /clubs/{id}/teams/{tid}/roster/{eid} ───────────────────────────────

def test_remove_from_roster_returns_204():
    """Retirar un jugador de la plantilla → 204 + archived_at establecido."""
    _override_user(_fake_admin())
    entry = _fake_roster_entry()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), entry]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/roster/1", headers=_auth_headers())
    assert r.status_code == 204
    assert entry.archived_at is not None


def test_remove_already_archived_roster_entry_returns_409():
    """Retirar una entrada ya archivada → 409."""
    _override_user(_fake_admin())
    entry = _fake_roster_entry()
    entry.archived_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), entry]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/roster/1", headers=_auth_headers())
    assert r.status_code == 409
