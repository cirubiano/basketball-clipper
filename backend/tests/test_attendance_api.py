"""
Tests de integración para la asistencia ampliada a entrenamientos.

Cubre:
  - POST .../trainings/{trid}/attendance con los 3 estados:
      presente (attended=True, is_late=False)
      retraso  (attended=True, is_late=True)
      ausente  (attended=False, absence_reason=<motivo>)
  - Validaciones Pydantic (model_validator):
      attended=True con absence_reason → 422
      attended=False sin absence_reason → 422
      absence_reason con valor fuera del enum → 422
  - GET training detail incluye is_late, absence_reason, notes

    docker compose run --rm backend pytest tests/test_attendance_api.py -v
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


def _fake_team(team_id: int = 10, club_id: int = 1) -> MagicMock:
    t = MagicMock()
    t.id = team_id
    t.club_id = club_id
    t.archived_at = None
    return t


def _fake_player(player_id: int = 42) -> MagicMock:
    p = MagicMock()
    p.id = player_id
    p.first_name = "Pau"
    p.last_name = "Gasol"
    p.archived_at = None
    return p


def _fake_training(training_id: int = 7, team_id: int = 10) -> MagicMock:
    now = datetime.now(UTC)
    t = MagicMock()
    t.id = training_id
    t.team_id = team_id
    t.season_id = 3
    t.date = now
    t.title = "Entrenamiento de defensa"
    t.notes = None
    t.created_by = 1
    t.created_at = now
    t.archived_at = None
    t.training_drills = []
    t.training_attendances = []
    return t


def _fake_attendance(ta_id: int = 1, training_id: int = 7, player_id: int = 42,
                     attended: bool = True, is_late: bool = False,
                     absence_reason=None, notes=None) -> MagicMock:
    ta = MagicMock()
    ta.id = ta_id
    ta.training_id = training_id
    ta.player_id = player_id
    ta.attended = attended
    ta.is_late = is_late
    ta.absence_reason = absence_reason
    ta.notes = notes
    player = MagicMock()
    player.first_name = "Pau"
    player.last_name = "Gasol"
    ta.player = player
    return ta


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


# ── Happy path — attended=True, is_late=False ────────────────────────────────

def test_attendance_presente_new_record():
    """attended=True, is_late=False → nuevo registro creado, 200."""
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
        json={"player_id": 42, "attended": True, "is_late": False},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["player_id"] == 42
    assert body["attended"] is True
    assert body["is_late"] is False
    assert body["absence_reason"] is None
    assert body["player_first_name"] == "Pau"


def test_attendance_presente_default_is_late_false():
    """attended=True sin is_late → is_late por defecto False."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["is_late"] is False


# ── Happy path — attended=True, is_late=True ─────────────────────────────────

def test_attendance_retraso_with_notes():
    """attended=True, is_late=True, notes → guardado correcto, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 2))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True, "is_late": True, "notes": "llegó 10min tarde"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["attended"] is True
    assert body["is_late"] is True
    assert body["notes"] == "llegó 10min tarde"
    assert body["absence_reason"] is None


def test_attendance_retraso_updates_existing_record():
    """is_late=True en registro existente (antes presente) → actualizado, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()
    existing_ta = _fake_attendance(attended=True, is_late=False)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, existing_ta]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True, "is_late": True, "notes": "tarde 5 min"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert existing_ta.is_late is True
    assert existing_ta.notes == "tarde 5 min"


# ── Happy path — attended=False + absence_reason ─────────────────────────────

def test_attendance_ausente_injury():
    """attended=False, absence_reason=injury → guardado correcto, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 3))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "injury"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["attended"] is False
    assert body["absence_reason"] == "injury"
    assert body["is_late"] is False


def test_attendance_ausente_other_with_notes():
    """attended=False, absence_reason=other, notes → guardado correcto, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 4))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "other", "notes": "viaje familiar"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["attended"] is False
    assert body["absence_reason"] == "other"
    assert body["notes"] == "viaje familiar"


def test_attendance_ausente_personal():
    """attended=False, absence_reason=personal → guardado correcto, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 5))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "personal"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["absence_reason"] == "personal"


def test_attendance_ausente_sanction():
    """attended=False, absence_reason=sanction → guardado correcto, 200."""
    _override_user(_fake_admin())
    training = _fake_training()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [training, None]
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 6))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "sanction"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert r.json()["absence_reason"] == "sanction"


# ── GET training detail — verifica is_late, absence_reason, notes ─────────────

def test_get_training_detail_includes_attendance_fields():
    """GET training detail devuelve is_late, absence_reason, notes en training_attendances."""
    _override_user(_fake_admin())

    ta = _fake_attendance(
        attended=False,
        is_late=False,
        absence_reason="injury",
        notes="esguince tobillo",
    )
    training = _fake_training()
    training.training_attendances = [ta]

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings/7", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body["training_attendances"]) == 1
    att = body["training_attendances"][0]
    assert att["attended"] is False
    assert att["is_late"] is False
    assert att["absence_reason"] == "injury"
    assert att["notes"] == "esguince tobillo"


def test_get_training_detail_late_attendance_fields():
    """GET training detail con retraso incluye is_late=True y notes."""
    _override_user(_fake_admin())

    ta = _fake_attendance(attended=True, is_late=True, absence_reason=None, notes="10 min tarde")
    training = _fake_training()
    training.training_attendances = [ta]

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings/7", headers=_auth_headers())
    assert r.status_code == 200
    att = r.json()["training_attendances"][0]
    assert att["attended"] is True
    assert att["is_late"] is True
    assert att["notes"] == "10 min tarde"
    assert att["absence_reason"] is None


# ── Validaciones Pydantic ─────────────────────────────────────────────────────

def test_attendance_attended_true_with_absence_reason_returns_422():
    """attended=True con absence_reason != null → 422 (model_validator)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True, "absence_reason": "injury"},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_attendance_attended_false_without_absence_reason_returns_422():
    """attended=False sin absence_reason → 422 (campo obligatorio si ausente)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_attendance_absent_with_is_late_true_returns_422():
    """attended=False con is_late=True → 422 (inconsistencia)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "injury", "is_late": True},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_attendance_invalid_absence_reason_enum_returns_422():
    """absence_reason con valor fuera del enum → 422."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": False, "absence_reason": "INVALID_REASON"},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_attendance_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/clubs/1/teams/10/trainings/7/attendance",
        json={"player_id": 42, "attended": True},
    )
    assert r.status_code == 401


# ── Resumen de asistencia implícito en GET trainings ─────────────────────────

def test_attendance_summary_counts_via_training_list():
    """
    Después de registrar asistencia, GET training detail refleja los
    conteos correctos: presentes, retrasos y ausentes en training_attendances.
    """
    _override_user(_fake_admin())

    ta_presente = _fake_attendance(ta_id=1, player_id=41, attended=True, is_late=False)
    ta_retraso = _fake_attendance(ta_id=2, player_id=42, attended=True, is_late=True, notes="tarde")
    ta_ausente = _fake_attendance(ta_id=3, player_id=43, attended=False, absence_reason="personal")

    training = _fake_training()
    training.training_attendances = [ta_presente, ta_retraso, ta_ausente]

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=training)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/trainings/7", headers=_auth_headers())
    assert r.status_code == 200
    attendances = r.json()["training_attendances"]
    assert len(attendances) == 3

    presentes = [a for a in attendances if a["attended"] and not a["is_late"]]
    retrasos = [a for a in attendances if a["attended"] and a["is_late"]]
    ausentes = [a for a in attendances if not a["attended"]]

    assert len(presentes) == 1
    assert len(retrasos) == 1
    assert len(ausentes) == 1
    assert ausentes[0]["absence_reason"] == "personal"
