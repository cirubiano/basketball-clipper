"""
Tests de integración para los endpoints de entrenamientos.

Cubre:
  - GET    /clubs/{id}/teams/{tid}/trainings
  - POST   /clubs/{id}/teams/{tid}/trainings
  - GET    /clubs/{id}/teams/{tid}/trainings/{trid}
  - PATCH  /clubs/{id}/teams/{tid}/trainings/{trid}
  - DELETE /clubs/{id}/teams/{tid}/trainings/{trid}
  - POST   .../trainings/{trid}/drills     (añadir ejercicio)
  - DELETE .../trainings/{trid}/drills/{did}
  - PATCH  .../trainings/{trid}/drills     (reordenar)
  - POST   .../trainings/{trid}/attendance (upsert asistencia)

    docker compose run --rm backend pytest tests/test_trainings_api.py -v
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


def _fake_player(player_id: int = 42, archived: bool = False) -> MagicMock:
    p = MagicMock()
    p.id = player_id
    p.first_name = "Pau"
    p.last_name = "Gasol"
    p.archived_at = datetime.now(timezone.utc) if archived else None
    return p


def _fake_drill(drill_id: int = 20) -> MagicMock:
    d = MagicMock()
    d.id = drill_id
    d.name = "Pressing 1-2-2"
    d.archived_at = None
    d.type = MagicMock()
    d.type.value = "drill"
    return d


def _fake_training(training_id: int = 7, team_id: int = 10) -> MagicMock:
    now = datetime.now(timezone.utc)
    t = MagicMock()
    t.id = training_id
    t.team_id = team_id
    t.season_id = 3
    t.date = "2025-11-15T10:00:00"
    t.title = "Entrenamiento de defensa"
    t.notes = None
    t.created_by = 1
    t.created_at = now
    t.archived_at = None
    t.training_drills = []
    t.training_attendances = []
    return t


def _fake_training_drill(td_id: int = 1, training_id: int = 7, drill_id: int = 20) -> MagicMock:
    td = MagicMock()
    td.id = td_id
    td.training_id = training_id
    td.drill_id = drill_id
    td.position = 0
    td.notes = None
    td.drill = _fake_drill(drill_id)
    return td


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


# ── GET /clubs/{id}/teams/{tid}/trainings ─────────────────────────────────────

def test_list_trainings_requires_team_access():
    """Sin perfil en el equipo → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings", headers=_auth_headers())
    assert r.status_code == 403


def test_list_trainings_returns_list_for_admin():
    """Admin recibe la lista de entrenamientos vacía."""
    _override_user(_fake_admin())
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_trainings_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/teams/10/trainings")
    assert r.status_code == 401


# ── POST /clubs/{id}/teams/{tid}/trainings ────────────────────────────────────

def test_create_training_returns_201_for_admin():
    """Admin crea un entrenamiento correctamente."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.add = MagicMock(side_effect=lambda t: setattr(t, "id", 7))
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings",
        json={
            "title": "Entrenamiento de defensa",
            "date": "2025-11-15T10:00:00",
            "season_id": 3,
        },
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "Entrenamiento de defensa"
    assert body["team_id"] == 10


def test_create_training_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings",
        json={"title": "Test", "date": "2025-11-15T10:00:00", "season_id": 3},
    )
    assert r.status_code == 401


def test_create_training_requires_coach_or_td():
    """Staff member (no HC/TD) → 403."""
    user = _fake_user()
    _override_user(user)

    profile = MagicMock()
    profile.role = "staff_member"

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=profile)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings",
        json={"title": "Test", "date": "2025-11-15T10:00:00", "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


# ── GET /clubs/{id}/teams/{tid}/trainings/{trid} ───────────────────────────────

def test_get_training_returns_200_for_admin():
    """Admin obtiene el detalle del entrenamiento."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings/7", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 7
    assert body["title"] == "Entrenamiento de defensa"


def test_get_training_returns_404_for_missing():
    """Entrenamiento inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings/999", headers=_auth_headers())
    assert r.status_code == 404


# ── PATCH /clubs/{id}/teams/{tid}/trainings/{trid} ────────────────────────────

def test_update_training_modifies_fields():
    """PATCH actualiza campos del entrenamiento."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/trainings/7",
        json={"title": "Defensa zona 2-3", "notes": "Enfocado en rebote"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert training.title == "Defensa zona 2-3"
    assert training.notes == "Enfocado en rebote"


# ── DELETE /clubs/{id}/teams/{tid}/trainings/{trid} ───────────────────────────

def test_archive_training_returns_204():
    """Archivar entrenamiento → 204 y archived_at establecido."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/trainings/7", headers=_auth_headers())
    assert r.status_code == 204
    assert training.archived_at is not None


# ── POST .../trainings/{trid}/drills ─────────────────────────────────────────

def test_add_training_drill_returns_201():
    """Añadir ejercicio al entrenamiento → 201."""
    _override_user(_fake_admin())
    training = _fake_training()
    drill = _fake_drill()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), drill]
    session.scalar.side_effect = [training, None]  # training found, no duplicate
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/drills",
        json={"drill_id": 20},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["drill_id"] == 20
    assert body["drill_title"] == "Pressing 1-2-2"


def test_add_training_drill_duplicate_returns_409():
    """Añadir el mismo ejercicio dos veces → 409."""
    _override_user(_fake_admin())
    training = _fake_training()
    drill = _fake_drill()
    existing_td = MagicMock()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), drill]
    session.scalar.side_effect = [training, existing_td]  # training found, dup found
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/drills",
        json={"drill_id": 20},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_add_training_drill_not_found_returns_404():
    """Ejercicio inexistente → 404."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), None]  # drill not found
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/drills",
        json={"drill_id": 99},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── DELETE .../trainings/{trid}/drills/{td_id} ────────────────────────────────

def test_remove_training_drill_returns_204():
    """Retirar ejercicio del entrenamiento → 204."""
    _override_user(_fake_admin())
    td = _fake_training_drill()

    mock_remaining = MagicMock()
    mock_remaining.scalars.return_value.all.return_value = []

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=td)
    session.execute = AsyncMock(return_value=mock_remaining)
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/trainings/7/drills/1",
        headers=_auth_headers(),
    )
    assert r.status_code == 204


def test_remove_training_drill_not_found_returns_404():
    """Ejercicio no está en el entrenamiento → 404."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/trainings/7/drills/999",
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── PATCH .../trainings/{trid}/drills (reordenar) ────────────────────────────

def test_reorder_training_drills_returns_200():
    """Reordenar ejercicios del entrenamiento → 200 con lista actualizada."""
    _override_user(_fake_admin())
    td = _fake_training_drill(drill_id=20)

    training_before = _fake_training()
    training_before.training_drills = [td]

    training_after = _fake_training()
    updated_td = _fake_training_drill(drill_id=20)
    updated_td.position = 0
    training_after.training_drills = [updated_td]

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    # _get_training_or_404 is called twice: once before update, once after commit
    session.scalar.side_effect = [training_before, training_after]
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/trainings/7/drills",
        json=[{"drill_id": 20, "position": 0}],
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body[0]["drill_id"] == 20


# ── POST .../trainings/{trid}/attendance ──────────────────────────────────────

def test_upsert_attendance_creates_new():
    """Jugador sin registro previo → asistencia creada, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]  # training found, no existing ta
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["player_id"] == 42
    assert body["attended"] is True
    assert body["player_first_name"] == "Pau"


def test_upsert_attendance_updates_existing():
    """Jugador ya tiene registro → asistencia actualizada, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    ta = MagicMock()
    ta.id = 1
    ta.training_id = 7
    ta.player_id = 42
    ta.attended = False

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, ta]  # training found, existing ta
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert ta.attended is True


def test_upsert_attendance_player_not_found_returns_404():
    """Jugador inexistente → 404."""
    _override_user(_fake_admin())
    training = _fake_training()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), None]  # player not found
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 99, "attended": True},
        headers=_auth_headers(),
    )
    assert r.status_code == 404
