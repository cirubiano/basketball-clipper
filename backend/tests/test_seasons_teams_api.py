"""
Tests de integración para temporadas y equipos.

Cubre:
  - GET    /clubs/{id}/seasons
  - POST   /clubs/{id}/seasons
  - PATCH  /clubs/{id}/seasons/{sid}/status  (RF-101 — 409 dos activas)

  - GET    /clubs/{id}/teams
  - POST   /clubs/{id}/teams
  - GET    /clubs/{id}/teams/{tid}
  - DELETE /clubs/{id}/teams/{tid}

    docker compose run --rm backend pytest tests/test_seasons_teams_api.py -v
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models.season import SeasonStatus


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


def _fake_season(season_id: int = 3, club_id: int = 1) -> MagicMock:
    now = datetime.now(timezone.utc)
    s = MagicMock()
    s.id = season_id
    s.club_id = club_id
    s.name = "2025-26"
    s.status = SeasonStatus.future
    s.starts_at = None
    s.ends_at = None
    s.created_at = now
    return s


def _fake_team(team_id: int = 10, club_id: int = 1) -> MagicMock:
    now = datetime.now(timezone.utc)
    t = MagicMock()
    t.id = team_id
    t.club_id = club_id
    t.season_id = 3
    t.name = "Equipo A"
    t.archived_at = None
    t.created_at = now
    return t


def _fake_orm_season(club_id: int = 1) -> MagicMock:
    """Simula el Season ORM creado en el router antes de flush."""
    return _fake_season(club_id=club_id)


def _add_side_effect_with_timestamps(obj: object) -> None:
    """Simula lo que el DB haría al hacer flush: asigna id y created_at."""
    obj.id = 1
    obj.created_at = datetime.now(timezone.utc)


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


# ── GET /clubs/{id}/seasons ───────────────────────────────────────────────────

def test_list_seasons_returns_empty_for_admin():
    """Admin recibe la lista de temporadas vacía."""
    _override_user(_fake_admin())

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalars = AsyncMock(return_value=mock_scalars)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/seasons", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_seasons_requires_club_access():
    """Usuario sin perfil en el club → 403."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/seasons", headers=_auth_headers())
    assert r.status_code == 403


def test_list_seasons_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/seasons")
    assert r.status_code == 401


# ── POST /clubs/{id}/seasons ──────────────────────────────────────────────────

def test_create_season_returns_201_for_admin():
    """Admin crea una temporada correctamente."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.add = MagicMock(side_effect=_add_side_effect_with_timestamps)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/seasons",
        json={"name": "2025-26"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "2025-26"
    assert body["status"] == "future"


def test_create_season_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/clubs/1/seasons", json={"name": "2025-26"})
    assert r.status_code == 401


def test_create_season_requires_td():
    """Usuario sin rol TD → 403."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil TD
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/seasons",
        json={"name": "2025-26"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_season_invalid_dates_returns_422():
    """ends_at <= starts_at → 422 (validator del schema)."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/seasons",
        json={
            "name": "2025-26",
            "starts_at": "2025-09-01",
            "ends_at": "2025-01-01",  # antes del inicio
        },
        headers=_auth_headers(),
    )
    assert r.status_code == 422


# ── PATCH /clubs/{id}/seasons/{sid}/status ─────────────────────────────────────

def test_update_season_status_returns_200():
    """Admin activa una temporada cuando no hay otra activa → 200."""
    _override_user(_fake_admin())
    season = _fake_season()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), season]
    session.scalar = AsyncMock(return_value=None)  # no hay otra temporada activa
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/seasons/3/status",
        json={"status": "active"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert season.status == SeasonStatus.active


def test_update_season_status_409_two_active():
    """Activar una temporada cuando ya hay otra activa → 409 (RF-101)."""
    _override_user(_fake_admin())
    season = _fake_season()
    other_active = _fake_season(season_id=99)
    other_active.status = SeasonStatus.active

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), season]
    session.scalar = AsyncMock(return_value=other_active)  # ya existe activa
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/seasons/3/status",
        json={"status": "active"},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_update_season_status_404_not_found():
    """Temporada inexistente → 404."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]  # temporada no encontrada
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/seasons/999/status",
        json={"status": "active"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── GET /clubs/{id}/teams ─────────────────────────────────────────────────────

def test_list_teams_returns_empty_for_admin():
    """Admin recibe la lista de equipos vacía."""
    _override_user(_fake_admin())

    mock_scalars = MagicMock()
    mock_scalars.all.return_value = []

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalars = AsyncMock(return_value=mock_scalars)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_teams_requires_club_access():
    """Usuario sin perfil en el club → 403."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams", headers=_auth_headers())
    assert r.status_code == 403


# ── POST /clubs/{id}/teams ────────────────────────────────────────────────────

def test_create_team_returns_201_for_admin():
    """Admin crea un equipo correctamente."""
    _override_user(_fake_admin())
    season = _fake_season()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), season]
    session.add = MagicMock(side_effect=_add_side_effect_with_timestamps)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams",
        json={"name": "Equipo A", "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Equipo A"


def test_create_team_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/clubs/1/teams",
        json={"name": "Equipo A", "season_id": 3},
    )
    assert r.status_code == 401


def test_create_team_requires_td():
    """Usuario sin rol TD → 403."""
    _override_user(_fake_user())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)  # sin perfil TD
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams",
        json={"name": "Equipo A", "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_team_season_not_found():
    """Temporada inexistente → 404."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]  # season not found
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams",
        json={"name": "Equipo A", "season_id": 999},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── GET /clubs/{id}/teams/{tid} ───────────────────────────────────────────────

def test_get_team_returns_200_for_admin():
    """Admin obtiene el detalle del equipo."""
    _override_user(_fake_admin())
    team = _fake_team()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), team]
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 10
    assert body["name"] == "Equipo A"


def test_get_team_returns_404():
    """Equipo inexistente → 404."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]  # team not found
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/999", headers=_auth_headers())
    assert r.status_code == 404


# ── DELETE /clubs/{id}/teams/{tid} ────────────────────────────────────────────

def test_archive_team_returns_204():
    """Archivar equipo → 204 y archived_at establecido."""
    _override_user(_fake_admin())
    team = _fake_team()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), team]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10", headers=_auth_headers())
    assert r.status_code == 204
    assert team.archived_at is not None
