"""
Tests de integración para el ciclo de vida (state machine) del partido.

Cubre:
  - POST .../start   — scheduled → in_progress
  - POST .../finish  — in_progress → finished
  - POST .../cancel  — scheduled|in_progress → cancelled
  - Transiciones inválidas → 409
  - Stats según estado del partido
  - Permisos (staff → 403, sin token → 401)

    docker compose run --rm backend pytest tests/test_match_lifecycle.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.main import app
from app.models.match import MatchStatus

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


def _fake_match(match_id: int = 5, team_id: int = 10, status: MatchStatus = MatchStatus.scheduled) -> MagicMock:
    now = datetime.now(UTC)
    m = MagicMock()
    m.id = match_id
    m.team_id = team_id
    m.season_id = 3
    m.date = now
    m.opponent_name = "Rival FC"
    m.location = "home"
    m.status = status
    m.notes = None
    m.our_score = None
    m.their_score = None
    m.created_by = 1
    m.created_at = now
    m.archived_at = None
    m.match_videos = []
    m.match_players = []
    m.match_stats = []
    return m


def _fake_match_player(mp_id: int = 1, match_id: int = 5, player_id: int = 42) -> MagicMock:
    mp = MagicMock()
    mp.id = mp_id
    mp.match_id = match_id
    mp.player_id = player_id
    p = MagicMock()
    p.first_name = "Pau"
    p.last_name = "Gasol"
    mp.player = p
    return mp


def _fake_match_stat(stat_id: int = 1, player_id: int = 42) -> MagicMock:
    s = MagicMock()
    s.id = stat_id
    s.match_id = 5
    s.player_id = player_id
    s.points = 20
    s.minutes = 32
    s.assists = 5
    s.defensive_rebounds = 3
    s.offensive_rebounds = 1
    s.steals = 2
    s.turnovers = 1
    s.fouls = 2
    p = MagicMock()
    p.first_name = "Pau"
    p.last_name = "Gasol"
    s.player = p
    return s


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


# ── POST .../start ────────────────────────────────────────────────────────────

def test_start_scheduled_match_transitions_to_in_progress():
    """scheduled → in_progress via POST .../start → 200, status=in_progress."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.scheduled)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    # _get_match_or_404 called twice: before mutation + after commit
    session.scalar = AsyncMock(side_effect=[match, match])
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start", headers=_auth_headers())
    assert r.status_code == 200
    assert match.status == MatchStatus.in_progress


def test_start_already_in_progress_returns_409():
    """in_progress → start → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.in_progress)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start", headers=_auth_headers())
    assert r.status_code == 409


def test_start_finished_match_returns_409():
    """finished → start → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.finished)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start", headers=_auth_headers())
    assert r.status_code == 409


def test_start_cancelled_match_returns_409():
    """cancelled → start → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.cancelled)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start", headers=_auth_headers())
    assert r.status_code == 409


def test_start_requires_coach_or_td():
    """Staff member → 403 al iniciar partido."""
    _override_user(_fake_user())

    staff_profile = MagicMock()
    staff_profile.role = "staff_member"

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=staff_profile)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start", headers=_auth_headers())
    assert r.status_code == 403


def test_start_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/clubs/1/teams/10/matches/5/start")
    assert r.status_code == 401


# ── POST .../finish ───────────────────────────────────────────────────────────

def test_finish_in_progress_match_transitions_to_finished():
    """in_progress → finished via POST .../finish → 200, status=finished."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.in_progress)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(side_effect=[match, match])
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/finish", headers=_auth_headers())
    assert r.status_code == 200
    assert match.status == MatchStatus.finished


def test_finish_scheduled_match_returns_409():
    """scheduled → finish → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.scheduled)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/finish", headers=_auth_headers())
    assert r.status_code == 409


def test_finish_already_finished_returns_409():
    """finished → finish → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.finished)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/finish", headers=_auth_headers())
    assert r.status_code == 409


def test_finish_requires_coach_or_td():
    """Staff member → 403 al finalizar partido."""
    _override_user(_fake_user())

    staff_profile = MagicMock()
    staff_profile.role = "staff_member"

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=staff_profile)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/finish", headers=_auth_headers())
    assert r.status_code == 403


def test_finish_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/clubs/1/teams/10/matches/5/finish")
    assert r.status_code == 401


# ── POST .../cancel ───────────────────────────────────────────────────────────

def test_cancel_scheduled_match_transitions_to_cancelled():
    """scheduled → cancelled via POST .../cancel → 200, status=cancelled."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.scheduled)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(side_effect=[match, match])
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel", headers=_auth_headers())
    assert r.status_code == 200
    assert match.status == MatchStatus.cancelled


def test_cancel_in_progress_match_transitions_to_cancelled():
    """in_progress → cancelled via POST .../cancel → 200, status=cancelled."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.in_progress)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(side_effect=[match, match])
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel", headers=_auth_headers())
    assert r.status_code == 200
    assert match.status == MatchStatus.cancelled


def test_cancel_finished_match_returns_409():
    """finished → cancel → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.finished)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel", headers=_auth_headers())
    assert r.status_code == 409


def test_cancel_already_cancelled_returns_409():
    """cancelled → cancel → 409 (transición inválida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.cancelled)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel", headers=_auth_headers())
    assert r.status_code == 409


def test_cancel_requires_coach_or_td():
    """Staff member → 403 al cancelar partido."""
    _override_user(_fake_user())

    staff_profile = MagicMock()
    staff_profile.role = "staff_member"

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=staff_profile)
    _override_db(session)

    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel", headers=_auth_headers())
    assert r.status_code == 403


def test_cancel_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post("/clubs/1/teams/10/matches/5/cancel")
    assert r.status_code == 401


# ── Stats según estado del partido ───────────────────────────────────────────

def test_stats_on_in_progress_match_are_accepted():
    """Registrar stats en partido in_progress → 200."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.in_progress)
    mp = _fake_match_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    # _get_match_or_404, convocatoria check, existing stat lookup
    session.scalar.side_effect = [match, mp, None]
    session.add = MagicMock(side_effect=lambda s: setattr(s, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 42, "points": 18, "assists": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 200


def test_stats_on_finished_match_are_accepted():
    """Registrar stats en partido finished → 200 (edición post-partido permitida)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.finished)
    mp = _fake_match_player()
    existing_stat = _fake_match_stat()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.side_effect = [match, mp, existing_stat]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 42, "points": 25},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert existing_stat.points == 25


def test_stats_player_not_in_convocatoria_returns_422():
    """Jugador no convocado → 422 (validación RF C-2)."""
    _override_user(_fake_admin())
    match = _fake_match(status=MatchStatus.in_progress)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.side_effect = [match, None]  # not in convocatoria
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 99, "points": 10},
        headers=_auth_headers(),
    )
    assert r.status_code == 422
    assert "convocatoria" in r.json()["detail"]
