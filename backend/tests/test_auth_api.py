"""
Tests de los endpoints de autenticación y gestión de perfiles.

    docker compose run --rm backend pytest tests/test_auth_api.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, get_current_user, hash_password
from app.core.database import get_db
from app.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1, profile_id: int | None = None) -> dict[str, str]:
    token = create_access_token(subject=user_id, profile_id=profile_id)
    return {"Authorization": f"Bearer {token}"}


def _fake_user(user_id: int = 1, email: str = "test@example.com") -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.email = email
    u.is_admin = False
    u.hashed_password = hash_password("secret123")
    return u


def _override_current_user(user: MagicMock):
    app.dependency_overrides[get_current_user] = lambda: user


def _override_db_session(session: AsyncMock):
    async def _dep():
        yield session
    app.dependency_overrides[get_db] = _dep


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── POST /auth/register ───────────────────────────────────────────────────────

def test_register_returns_token():
    session = AsyncMock()
    session.scalar.return_value = None  # email no existe aún
    session.add = MagicMock(side_effect=lambda u: setattr(u, "id", 42))
    session.flush = AsyncMock()
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/register",
        json={"email": "nuevo@example.com", "password": "segura123"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "access_token" in body
    assert len(body["access_token"]) > 20


def test_register_conflict_if_email_exists():
    session = AsyncMock()
    session.scalar.return_value = _fake_user()  # ya existe
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/register",
        json={"email": "test@example.com", "password": "cualquier"},
    )
    assert r.status_code == 409
    assert "already registered" in r.json()["detail"]


# ── POST /auth/login ──────────────────────────────────────────────────────────

def test_login_valid_credentials_returns_token():
    user = _fake_user()
    session = AsyncMock()
    session.scalar.return_value = user
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/login",
        json={"email": user.email, "password": "secret123"},
    )
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


def test_login_invalid_password_returns_401():
    user = _fake_user()
    session = AsyncMock()
    session.scalar.return_value = user
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/login",
        json={"email": user.email, "password": "wrongpassword"},
    )
    assert r.status_code == 401


def test_login_unknown_email_returns_401():
    session = AsyncMock()
    session.scalar.return_value = None  # usuario no encontrado
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/login",
        json={"email": "noexiste@example.com", "password": "cualquier"},
    )
    assert r.status_code == 401


# ── GET /auth/me ──────────────────────────────────────────────────────────────

def test_me_returns_user_data():
    user = _fake_user()
    _override_current_user(user)

    client = TestClient(app)
    r = client.get("/auth/me", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == user.email
    assert body["id"] == user.id


def test_me_requires_auth():
    client = TestClient(app)
    r = client.get("/auth/me")
    assert r.status_code == 401


# ── POST /auth/switch-profile ─────────────────────────────────────────────────

def test_switch_profile_returns_token_with_profile_id():
    user = _fake_user()
    _override_current_user(user)

    mock_profile = MagicMock()
    mock_profile.id = 7
    mock_profile.user_id = user.id
    mock_profile.archived_at = None

    session = AsyncMock()
    session.get.return_value = mock_profile
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/switch-profile",
        json={"profile_id": 7},
        headers=_auth_headers(user_id=user.id),
    )
    assert r.status_code == 200, r.text
    # El token devuelto debe contener profile_id=7
    import base64, json as _json
    token = r.json()["access_token"]
    payload_b64 = token.split(".")[1]
    # Añadir padding si es necesario
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = _json.loads(base64.b64decode(payload_b64))
    assert payload.get("profile_id") == 7


def test_switch_profile_rejects_profile_of_another_user():
    user = _fake_user(user_id=1)
    _override_current_user(user)

    mock_profile = MagicMock()
    mock_profile.id = 7
    mock_profile.user_id = 99  # pertenece a otro usuario
    mock_profile.archived_at = None

    session = AsyncMock()
    session.get.return_value = mock_profile
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/auth/switch-profile",
        json={"profile_id": 7},
        headers=_auth_headers(user_id=1),
    )
    assert r.status_code == 404


# ── POST /auth/clear-profile ──────────────────────────────────────────────────

def test_clear_profile_returns_token_without_profile_id():
    user = _fake_user()
    _override_current_user(user)

    client = TestClient(app)
    r = client.post(
        "/auth/clear-profile",
        headers=_auth_headers(user_id=user.id, profile_id=5),
    )
    assert r.status_code == 200, r.text
    import base64, json as _json
    token = r.json()["access_token"]
    payload_b64 = token.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = _json.loads(base64.b64decode(payload_b64))
    assert "profile_id" not in payload
