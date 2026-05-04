"""
Tests misceláneos para cubrir rutas con baja cobertura:
  - GET    /clips/{id}          (get_clip)
  - GET    /clips/              (list_clips TD path — sin team_id)
  - PATCH  /auth/me/password    (change_password)
  - POST   /clubs               (create_club)
  - GET    /clubs/mine          (list_my_clubs)
  - GET    /clubs/{id}          (get_club)
  - PATCH  /clubs/{id}          (update_club)

    docker compose run --rm backend pytest tests/test_misc_api.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_profile,
    get_current_user,
    require_admin,
)
from app.main import app

# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id)
    return {"Authorization": f"Bearer {token}"}


def _now() -> datetime:
    return datetime.now(UTC)


def _fake_admin(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = True
    u.hashed_password = "hashed"
    return u


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.is_admin = False
    u.hashed_password = "hashed"
    return u


def _fake_club(club_id: int = 1) -> MagicMock:
    c = MagicMock()
    c.id = club_id
    c.name = "Club Demo"
    c.logo_url = None
    c.archived_at = None
    c.created_at = _now()
    return c


def _fake_clip(clip_id: int = 3) -> MagicMock:
    c = MagicMock()
    c.id = clip_id
    c.video_id = 1
    c.start_time = 10.0
    c.end_time = 30.0
    c.team = "A"
    c.s3_key = "clips/test.mp4"
    c.duration = 20.0
    c.created_at = _now()
    return c


def _fake_profile(team_id: int | None = 10, club_id: int = 1) -> MagicMock:
    p = MagicMock()
    p.id = 1
    p.user_id = 1
    p.club_id = club_id
    p.team_id = team_id
    p.archived_at = None
    return p


def _override_user(user: MagicMock) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _override_admin(user: MagicMock) -> None:
    app.dependency_overrides[require_admin] = lambda: user


def _override_profile(profile: MagicMock) -> None:
    app.dependency_overrides[get_current_profile] = lambda: profile


def _override_db(session: AsyncMock) -> None:
    async def _dep():
        yield session
    app.dependency_overrides[get_db] = _dep


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── GET /clips/{id} ───────────────────────────────────────────────────────────

def test_get_clip_not_found():
    """404 si el clip no existe o pertenece a otro usuario."""
    _override_user(_fake_user())

    execute_mock = MagicMock()
    execute_mock.scalar_one_or_none.return_value = None

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clips/99", headers=_auth_headers())
    assert r.status_code == 404


def test_get_clip_success():
    """Devuelve el clip con URL pre-firmada."""
    _override_user(_fake_user())
    clip = _fake_clip()

    execute_mock = MagicMock()
    execute_mock.scalar_one_or_none.return_value = clip

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    with patch("app.services.storage.get_presigned_url", return_value="http://s3/clip"):
        r = TestClient(app).get("/clips/3", headers=_auth_headers())

    assert r.status_code == 200
    assert r.json()["id"] == 3


# ── GET /clips/ (TD path — sin team_id) ──────────────────────────────────────

def test_list_clips_td_path():
    """TechnicalDirector (sin team_id) ve clips de todo el club."""
    profile = _fake_profile(team_id=None, club_id=1)
    _override_profile(profile)

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    execute_mock = MagicMock()
    execute_mock.scalars.return_value = scalars_mock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=execute_mock)
    _override_db(session)

    r = TestClient(app).get("/clips/", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


# ── PATCH /auth/me/password ───────────────────────────────────────────────────

def test_change_password_success():
    """Cambia la contraseña del usuario autenticado."""
    user = _fake_user()

    session = AsyncMock()
    _override_user(user)
    _override_db(session)

    with (
        patch("app.routers.auth.verify_password", return_value=True),
        patch("app.routers.auth.hash_password", return_value="new_hashed"),
    ):
        r = TestClient(app).patch(
            "/auth/me/password",
            json={"current_password": "old12345", "new_password": "new45678"},
            headers=_auth_headers(),
        )

    assert r.status_code == 204
    assert user.hashed_password == "new_hashed"


def test_change_password_wrong_current():
    """400 si la contraseña actual es incorrecta."""
    user = _fake_user()
    session = AsyncMock()
    _override_user(user)
    _override_db(session)

    with patch("app.routers.auth.verify_password", return_value=False):
        r = TestClient(app).patch(
            "/auth/me/password",
            json={"current_password": "wrong", "new_password": "new45678"},
            headers=_auth_headers(),
        )

    assert r.status_code == 400


def test_change_password_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).patch(
        "/auth/me/password",
        json={"current_password": "old", "new_password": "new"},
    )
    assert r.status_code == 401


# ── POST /clubs ───────────────────────────────────────────────────────────────

def test_create_club_success():
    """Admin crea un club."""
    admin = _fake_admin()
    _override_admin(admin)

    session = AsyncMock()
    session.add = MagicMock(side_effect=lambda c: _set_club_fields(c))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs",
        json={"name": "Club Demo"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201


def _set_club_fields(obj: MagicMock) -> None:
    obj.id = 1
    obj.name = getattr(obj, "name", "Club Demo")
    obj.logo_url = None
    obj.archived_at = None
    obj.created_at = _now()


# ── GET /clubs/mine ───────────────────────────────────────────────────────────

def test_list_my_clubs_empty():
    """Devuelve lista vacía si el usuario no pertenece a ningún club."""
    _override_user(_fake_user())

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=scalars_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/mine", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_my_clubs_returns_clubs():
    """Devuelve los clubs del usuario."""
    _override_user(_fake_user())
    club = _fake_club()

    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [club]

    session = AsyncMock()
    session.scalars = AsyncMock(return_value=scalars_mock)
    _override_db(session)

    r = TestClient(app).get("/clubs/mine", headers=_auth_headers())
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "Club Demo"


def test_list_my_clubs_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/mine")
    assert r.status_code == 401


# ── GET /clubs/{id} ───────────────────────────────────────────────────────────

def test_get_club_success():
    """Admin puede ver el detalle de un club."""
    _override_user(_fake_admin())
    club = _fake_club()

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    _override_db(session)

    r = TestClient(app).get("/clubs/1", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json()["name"] == "Club Demo"


def test_get_club_not_found():
    """404 si el club no existe."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/clubs/99", headers=_auth_headers())
    assert r.status_code == 404


def test_get_club_no_access():
    """403 si el usuario no tiene perfil en el club."""
    _override_user(_fake_user())
    club = _fake_club()

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1", headers=_auth_headers())
    assert r.status_code == 403


# ── PATCH /clubs/{id} ────────────────────────────────────────────────────────

def test_update_club_success():
    """Admin puede actualizar el nombre de un club."""
    admin = _fake_admin()
    _override_admin(admin)
    club = _fake_club()

    session = AsyncMock()
    session.get = AsyncMock(return_value=club)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1",
        json={"name": "Nuevo Nombre"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert club.name == "Nuevo Nombre"


# ── core/security.py coverage — real get_current_user path ───────────────────

def test_get_current_user_real_jwt_path():
    """Cubre get_current_user con JWT real (no override). db.get devuelve el user."""
    from app.models.user import User as UserModel
    user = MagicMock(spec=UserModel)
    user.id = 1
    user.email = "test@example.com"
    user.is_admin = False

    # Only mock DB, NOT get_current_user
    session = AsyncMock()
    session.get = AsyncMock(return_value=user)
    _override_db(session)

    r = TestClient(app).get("/auth/me", headers=_auth_headers(user_id=1))
    assert r.status_code == 200


def test_get_current_user_invalid_token():
    """Cubre get_current_user con JWT invalido → 401."""
    session = AsyncMock()
    _override_db(session)

    r = TestClient(app).get("/auth/me", headers={"Authorization": "Bearer badtoken"})
    assert r.status_code == 401


def test_get_current_user_user_not_in_db():
    """Cubre get_current_user cuando el user no existe en BD → 401."""
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/auth/me", headers=_auth_headers(user_id=999))
    assert r.status_code == 401


def test_require_admin_non_admin_returns_403():
    """Cubre require_admin cuando user.is_admin=False → 403."""
    from app.models.user import User as UserModel
    user = MagicMock(spec=UserModel)
    user.id = 1
    user.is_admin = False

    session = AsyncMock()
    session.get = AsyncMock(return_value=user)
    _override_db(session)

    # POST /clubs requiere Admin — no mockeamos require_admin
    r = TestClient(app).post("/clubs", json={"name": "X"}, headers=_auth_headers(user_id=1))
    assert r.status_code == 403
