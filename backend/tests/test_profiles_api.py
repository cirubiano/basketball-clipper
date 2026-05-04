"""
Tests de integración para el router de perfiles.

Cubre:
  - GET    /profiles          (list_my_profiles — selector de perfil, RF-010)
  - DELETE /profiles/{id}     (archive_profile — retirar rol, RF-052)

    docker compose run --rm backend pytest tests/test_profiles_api.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
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


def _fake_profile(
    profile_id: int = 5,
    user_id: int = 1,
    club_id: int = 1,
    team_id: int | None = 10,
) -> MagicMock:
    now = datetime.now(UTC)
    p = MagicMock()
    p.id = profile_id
    p.user_id = user_id
    p.club_id = club_id
    p.team_id = team_id
    p.season_id = 3
    p.role = "head_coach"
    p.archived_at = None
    p.created_at = now
    # Relationships for _enrich_profile
    club = MagicMock()
    club.name = "Club Ejemplo"
    team = MagicMock()
    team.name = "Equipo A"
    season = MagicMock()
    season.name = "2025-26"
    user = MagicMock()
    user.email = "coach@club.com"
    p.club = club
    p.team = team
    p.season = season
    p.user = user
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


# ── GET /profiles ─────────────────────────────────────────────────────────────

def test_list_my_profiles_returns_empty():
    """Usuario sin perfiles → lista vacía."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=scalars_mock)
    _override_db(session)

    r = TestClient(app).get("/profiles", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_my_profiles_returns_entries():
    """Devuelve la lista de perfiles del usuario activo."""
    _override_user(_fake_user())
    profile = _fake_profile()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [profile]

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=scalars_mock)
    _override_db(session)

    r = TestClient(app).get("/profiles", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == 5
    assert data[0]["club_name"] == "Club Ejemplo"
    assert data[0]["team_name"] == "Equipo A"


def test_list_my_profiles_without_team():
    """Perfil de TechnicalDirector sin equipo tiene team_name=None."""
    _override_user(_fake_user())
    profile = _fake_profile(team_id=None)
    profile.team = None

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [profile]

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=scalars_mock)
    _override_db(session)

    r = TestClient(app).get("/profiles", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert data[0]["team_name"] is None


def test_list_my_profiles_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/profiles")
    assert r.status_code == 401


# ── DELETE /profiles/{id} ─────────────────────────────────────────────────────

def test_archive_profile_success_with_team():
    """
    Admin archiva un perfil con team_id.
    RF-164: si no quedan más perfiles del usuario en ese equipo, congela el playbook.
    """
    _override_user(_fake_admin())
    profile = _fake_profile(team_id=10)

    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    session.scalar = AsyncMock(return_value=None)  # no remaining profiles in team
    _override_db(session)

    with (
        patch("app.routers.profiles.freeze_playbook_entries", new=AsyncMock()) as mock_freeze,
        patch("app.routers.profiles.break_catalog_references", new=AsyncMock()) as mock_break,
    ):
        r = TestClient(app).delete("/profiles/5", headers=_auth_headers())

    assert r.status_code == 204
    assert profile.archived_at is not None
    mock_freeze.assert_called_once()
    mock_break.assert_called_once()


def test_archive_profile_success_remaining_team_member():
    """
    RF-164: si quedan otros perfiles del usuario en el equipo, no se congela el playbook.
    """
    _override_user(_fake_admin())
    profile = _fake_profile(team_id=10)
    remaining = _fake_profile(profile_id=6, team_id=10)

    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    session.scalar = AsyncMock(return_value=remaining)  # sigue habiendo perfiles
    _override_db(session)

    with (
        patch("app.routers.profiles.freeze_playbook_entries", new=AsyncMock()) as mock_freeze,
        patch("app.routers.profiles.break_catalog_references", new=AsyncMock()) as mock_break,
    ):
        r = TestClient(app).delete("/profiles/5", headers=_auth_headers())

    assert r.status_code == 204
    mock_freeze.assert_not_called()
    mock_break.assert_called_once()


def test_archive_profile_success_technical_director():
    """
    TD (sin team_id) archiva perfil: congela el playbook de todos los equipos del club.
    """
    _override_user(_fake_admin())
    profile = _fake_profile(team_id=None)

    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    _override_db(session)

    with (
        patch("app.routers.profiles.freeze_all_club_playbook_entries", new=AsyncMock()) as mock_freeze_all,
        patch("app.routers.profiles.break_catalog_references", new=AsyncMock()) as mock_break,
    ):
        r = TestClient(app).delete("/profiles/5", headers=_auth_headers())

    assert r.status_code == 204
    mock_freeze_all.assert_called_once()
    mock_break.assert_called_once()


def test_archive_profile_not_found():
    """404 si el perfil no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).delete("/profiles/99", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_profile_already_archived():
    """404 si el perfil ya está archivado."""
    _override_user(_fake_admin())
    profile = _fake_profile()
    profile.archived_at = datetime.now(UTC)

    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    _override_db(session)

    r = TestClient(app).delete("/profiles/5", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_profile_forbidden_for_non_td():
    """403 si el usuario no es TechnicalDirector del club."""
    _override_user(_fake_user())
    profile = _fake_profile()

    session = AsyncMock()
    session.get = AsyncMock(return_value=profile)
    session.scalar = AsyncMock(return_value=None)  # no es TD
    _override_db(session)

    r = TestClient(app).delete("/profiles/5", headers=_auth_headers())
    assert r.status_code == 403


def test_archive_profile_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).delete("/profiles/5")
    assert r.status_code == 401
