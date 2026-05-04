"""
Tests de integración para los endpoints de partidos.

Cubre:
  - GET  /clubs/{id}/teams/{tid}/matches
  - POST /clubs/{id}/teams/{tid}/matches
  - GET  /clubs/{id}/teams/{tid}/matches/{mid}
  - PATCH/DELETE idem
  - POST .../matches/{mid}/players     (añadir a convocatoria)
  - DELETE .../matches/{mid}/players/{pid}
  - POST .../matches/{mid}/stats       (upsert + validación convocatoria)

    docker compose run --rm backend pytest tests/test_matches_api.py -v
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


def _fake_match(match_id: int = 5, team_id: int = 10) -> MagicMock:
    now = datetime.now(timezone.utc)
    m = MagicMock()
    m.id = match_id
    m.team_id = team_id
    m.season_id = 3
    m.date = "2025-10-01T18:00:00"
    m.opponent_name = "Rival FC"
    m.location = "home"
    m.status = "scheduled"
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
    mp.player = _fake_player(player_id)
    return mp


def _fake_match_stat(stat_id: int = 1, match_id: int = 5, player_id: int = 42) -> MagicMock:
    s = MagicMock()
    s.id = stat_id
    s.match_id = match_id
    s.player_id = player_id
    s.points = 20
    s.minutes = 32
    s.assists = 5
    s.defensive_rebounds = 3
    s.offensive_rebounds = 1
    s.steals = 2
    s.turnovers = 1
    s.fouls = 2
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


# ── GET /clubs/{id}/teams/{tid}/matches ───────────────────────────────────────

def test_list_matches_requires_team_access():
    """Sin perfil en el equipo → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches", headers=_auth_headers())
    assert r.status_code == 403


def test_list_matches_returns_list_for_admin():
    """Admin recibe la lista de partidos vacía."""
    _override_user(_fake_admin())
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.execute = AsyncMock(return_value=mock_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_matches_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/teams/10/matches")
    assert r.status_code == 401


# ── POST /clubs/{id}/teams/{tid}/matches ──────────────────────────────────────

def test_create_match_returns_201_for_admin():
    """Admin crea un partido correctamente."""
    _override_user(_fake_admin())
    match = _fake_match()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.add = MagicMock(side_effect=lambda m: setattr(m, "id", 5))
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches",
        json={
            "opponent_name": "Rival FC",
            "date": "2025-10-01T18:00:00",
            "location": "home",
            "season_id": 3,
            "competition_id": 1,
        },
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["opponent_name"] == "Rival FC"
    assert body["location"] == "home"


def test_create_match_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).post(
        "/clubs/1/teams/10/matches",
        json={"opponent_name": "Rival FC", "date": "2025-10-01T18:00:00", "location": "home", "season_id": 3, "competition_id": 1},
    )
    assert r.status_code == 401


def test_create_match_requires_coach_or_td():
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
        "/clubs/1/teams/10/matches",
        json={"opponent_name": "Rival FC", "date": "2025-10-01T18:00:00", "location": "home", "season_id": 3, "competition_id": 1},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_match_invalid_location_returns_422():
    """Valor de location inválido → 422 Pydantic validation."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches",
        json={"opponent_name": "Rival FC", "date": "2025-10-01", "location": "INVALID", "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


# ── GET /clubs/{id}/teams/{tid}/matches/{mid} ──────────────────────────────────

def test_get_match_returns_200_for_admin():
    """Admin obtiene el detalle del partido."""
    _override_user(_fake_admin())
    match = _fake_match()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches/5", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 5
    assert body["opponent_name"] == "Rival FC"


def test_get_match_returns_404_for_missing():
    """Partido inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=None)  # match not found
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches/999", headers=_auth_headers())
    assert r.status_code == 404


# ── PATCH /clubs/{id}/teams/{tid}/matches/{mid} ────────────────────────────────

def test_update_match_modifies_fields():
    """PATCH actualiza campos del partido (status excluido — usar /start, /finish, /cancel)."""
    _override_user(_fake_admin())
    match = _fake_match()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/matches/5",
        json={"our_score": 85, "their_score": 72},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert match.our_score == 85
    assert match.their_score == 72


# ── DELETE /clubs/{id}/teams/{tid}/matches/{mid} ───────────────────────────────

def test_archive_match_returns_204():
    """Archivar partido → 204 y archived_at establecido."""
    _override_user(_fake_admin())
    match = _fake_match()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/matches/5", headers=_auth_headers())
    assert r.status_code == 204
    assert match.archived_at is not None


# ── POST .../matches/{mid}/players ────────────────────────────────────────────

def test_add_match_player_returns_201():
    """Añadir jugador a la convocatoria → 201."""
    _override_user(_fake_admin())
    match = _fake_match()
    player = _fake_player()

    mp = MagicMock()
    mp.id = 1
    mp.match_id = 5
    mp.player_id = 42

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [match, None]  # match found, not yet in convocatoria
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["player_id"] == 42
    assert body["player_first_name"] == "Pau"


def test_add_match_player_duplicate_returns_409():
    """Añadir el mismo jugador dos veces → 409."""
    _override_user(_fake_admin())
    match = _fake_match()
    player = _fake_player()
    existing_mp = MagicMock()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [match, existing_mp]  # already in convocatoria
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


def test_add_match_player_archived_player_returns_404():
    """Añadir jugador archivado → 404."""
    _override_user(_fake_admin())
    match = _fake_match()
    archived_player = _fake_player(archived=True)

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), archived_player]
    session.scalar = AsyncMock(return_value=match)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── DELETE .../matches/{mid}/players/{pid} ────────────────────────────────────

def test_remove_match_player_returns_204():
    """Retirar jugador de la convocatoria con partido programado → 204."""
    _override_user(_fake_admin())
    match = _fake_match()   # status = "scheduled"
    mp = _fake_match_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.side_effect = [match, mp]   # match lookup, then mp lookup
    session.delete = AsyncMock()
    session.commit = AsyncMock()
    _override_db(session)

    import sys
    try:
        r = TestClient(app, raise_server_exceptions=False).delete(
            "/clubs/1/teams/10/matches/5/players/42",
            headers=_auth_headers(),
        )
        print(f"\n[DIAG] status={r.status_code} body={r.text!r}", file=sys.stderr)
        
    except Exception as exc:
        print(f"\n[DIAG] TestClient RAISED: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
    assert r.status_code == 204


def test_remove_match_player_not_in_convocatoria_returns_404():
    """Retirar jugador que no está en la convocatoria → 404."""
    _override_user(_fake_admin())

    session = AsyncMock()
    session.get = AsyncMock(return_value=_fake_club())
    session.scalar = AsyncMock(return_value=None)
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/matches/5/players/42",
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ── POST .../matches/{mid}/stats ──────────────────────────────────────────────

def test_upsert_stat_player_not_in_convocatoria_returns_422():
    """Jugador no convocado → 422 (RF C-2)."""
    _override_user(_fake_admin())
    match = _fake_match()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.side_effect = [match, None]  # match found, not in convocatoria
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 42, "points": 20},
        headers=_auth_headers(),
    )
    assert r.status_code == 422
    assert "convocatoria" in r.json()["detail"]


def test_upsert_stat_creates_new_stat_for_convocated_player():
    """Jugador convocado → stat creado, 200."""
    _override_user(_fake_admin())
    match = _fake_match()
    mp = _fake_match_player()
    stat = _fake_match_stat()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    # scalar calls: _get_match_or_404, convocatoria check, existing stat lookup
    session.scalar.side_effect = [match, mp, None]  # no existing stat
    session.add = MagicMock(side_effect=lambda s: setattr(s, "id", 1))
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 42, "points": 20, "assists": 5},
        headers=_auth_headers(),
    )
    assert r.status_code == 200


def test_upsert_stat_updates_existing_stat():
    """Jugador ya tiene stat → se actualiza, 200."""
    _override_user(_fake_admin())
    match = _fake_match()
    mp = _fake_match_player()
    stat = _fake_match_stat()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.side_effect = [match, mp, stat]  # existing stat found
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/stats",
        json={"player_id": 42, "points": 30},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert stat.points == 30


# ── Convocatoria bloqueada durante partido en curso / finalizado ──────────────

def _fake_match_in_progress(match_id: int = 5, team_id: int = 10) -> MagicMock:
    from app.models.match import MatchStatus
    m = _fake_match(match_id, team_id)
    m.status = MatchStatus.in_progress
    m.match_players = []
    m.match_stats = []
    m.match_videos = []
    m.opponent_stats = []
    return m


def _fake_match_finished(match_id: int = 5, team_id: int = 10) -> MagicMock:
    from app.models.match import MatchStatus
    m = _fake_match(match_id, team_id)
    m.status = MatchStatus.finished
    m.match_players = []
    m.match_stats = []
    m.match_videos = []
    m.opponent_stats = []
    return m


def test_add_match_player_in_progress_returns_409():
    """Añadir jugador a convocatoria con partido en curso → 409."""
    _override_user(_fake_admin())
    match = _fake_match_in_progress()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.return_value = match
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 409
    assert "convocatoria" in r.json()["detail"]


def test_add_match_player_finished_returns_409():
    """Añadir jugador a convocatoria con partido finalizado → 409."""
    _override_user(_fake_admin())
    match = _fake_match_finished()
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.return_value = match
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 409
    assert "convocatoria" in r.json()["detail"]


def test_add_match_player_scheduled_is_allowed():
    """Añadir jugador a convocatoria con partido programado → 201 (caso nominal)."""
    _override_user(_fake_admin())
    match = _fake_match()           # status = "scheduled"
    player = _fake_player()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), player]
    session.scalar.side_effect = [match, None]   # match OK, no existing mp
    session.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", 99))
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/matches/5/players",
        json={"player_id": 42},
        headers=_auth_headers(),
    )
    assert r.status_code == 201


def test_remove_match_player_in_progress_returns_409():
    """Retirar jugador de convocatoria con partido en curso → 409."""
    _override_user(_fake_admin())
    match = _fake_match_in_progress()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.return_value = match
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/matches/5/players/42",
        headers=_auth_headers(),
    )
    assert r.status_code == 409
    assert "convocatoria" in r.json()["detail"]


def test_remove_match_player_finished_returns_409():
    """Retirar jugador de convocatoria con partido finalizado → 409."""
    _override_user(_fake_admin())
    match = _fake_match_finished()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar.return_value = match
    _override_db(session)

    r = TestClient(app).delete(
        "/clubs/1/teams/10/matches/5/players/42",
        headers=_auth_headers(),
    )
    assert r.status_code == 409
    assert "convocatoria" in r.json()["detail"]


def test_remove_match_player_scheduled_is_al