"""
Tests de integración para los endpoints de estadísticas personalizadas y staff.

Cubre:
  - GET/POST/PATCH/DELETE  /clubs/{id}/teams/{tid}/stat-attributes[/{attr_id}]
  - GET/PUT/DELETE         /clubs/{id}/teams/{tid}/matches/{mid}/custom-stats[/{sid}]
  - POST/DELETE            /clubs/{id}/teams/{tid}/staff[/{profile_id}]

    docker compose run --rm backend pytest tests/test_stat_attributes_api.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import get_current_user
from app.main import app

# ── Helpers ───────────────────────────────────────────────────────────────────


def _auth_headers(user_id: int = 1) -> dict[str, str]:
    from app.core.security import create_access_token
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


def _fake_match(match_id: int = 5, team_id: int = 10) -> MagicMock:
    m = MagicMock()
    m.id = match_id
    m.team_id = team_id
    m.archived_at = None
    return m


def _fake_season(season_id: int = 3, club_id: int = 1) -> MagicMock:
    s = MagicMock()
    s.id = season_id
    s.club_id = club_id
    s.archived_at = None
    return s


def _fake_stat_attr(
    attr_id: int = 1,
    team_id: int = 10,
    name: str = "Triples",
) -> MagicMock:
    a = MagicMock()
    a.id = attr_id
    a.team_id = team_id
    a.name = name
    a.short_name = "3P"
    a.description = "Triples anotados"
    a.color = "violet"
    a.type = "count"
    a.archived_at = None
    a.created_at = datetime.now(UTC)
    return a


def _fake_custom_stat(
    stat_id: int = 1,
    match_id: int = 5,
    attr_id: int = 1,
    player_id: int | None = 42,
    opponent_player_id: int | None = None,
    value: int = 3,
) -> MagicMock:
    s = MagicMock()
    s.id = stat_id
    s.match_id = match_id
    s.stat_attribute_id = attr_id
    s.player_id = player_id
    s.opponent_player_id = opponent_player_id
    s.value = value
    s.created_at = datetime.now(UTC)
    return s


def _fake_club_member(club_id: int = 1, user_id: int = 99) -> MagicMock:
    m = MagicMock()
    m.club_id = club_id
    m.user_id = user_id
    m.archived_at = None
    return m


def _fake_enriched_profile(
    profile_id: int = 1,
    role: str = "staff_member",
) -> MagicMock:
    p = MagicMock()
    p.id = profile_id
    p.user_id = 99
    p.club_id = 1
    p.team_id = 10
    p.season_id = 3
    p.role = role
    p.archived_at = None
    p.created_at = datetime.now(UTC)
    # Relationships needed by _enrich_profile
    p.club.name = "Club Ejemplo"
    p.team.name = "Equipo A"
    p.season.name = "2025/26"
    p.user.email = "staff@example.com"
    return p


def _fake_profile(
    profile_id: int = 1,
    club_id: int = 1,
    team_id: int = 10,
    role: str = "staff_member",
) -> MagicMock:
    p = MagicMock()
    p.id = profile_id
    p.club_id = club_id
    p.team_id = team_id
    p.role = role
    p.archived_at = None
    p.created_at = datetime.now(UTC)
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


# ═══════════════════════════════════════════════════════════════════════════════
# GET /clubs/{id}/teams/{tid}/stat-attributes
# ═══════════════════════════════════════════════════════════════════════════════

def test_list_stat_attributes_returns_empty_for_admin():
    """Admin recibe lista vacía."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.return_value = _fake_team()
    scalars_result = MagicMock()
    scalars_result.all.return_value = []
    session.scalars = AsyncMock(return_value=scalars_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/stat-attributes", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_stat_attributes_returns_attrs():
    """Admin obtiene atributos activos del equipo."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()
    session = AsyncMock()
    session.get.return_value = _fake_team()
    scalars_result = MagicMock()
    scalars_result.all.return_value = [attr]
    session.scalars = AsyncMock(return_value=scalars_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/stat-attributes", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["name"] == "Triples"
    assert body[0]["short_name"] == "3P"
    assert body[0]["color"] == "violet"


def test_list_stat_attributes_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/teams/10/stat-attributes")
    assert r.status_code == 401


def test_list_stat_attributes_requires_membership():
    """Usuario sin perfil en el equipo → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.return_value = _fake_team()
    session.scalar = AsyncMock(return_value=None)  # sin perfil
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/stat-attributes", headers=_auth_headers())
    assert r.status_code == 403


def test_list_stat_attributes_team_not_found():
    """Equipo inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.return_value = None
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/999/stat-attributes", headers=_auth_headers())
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# POST /clubs/{id}/teams/{tid}/stat-attributes
# ═══════════════════════════════════════════════════════════════════════════════

def test_create_stat_attribute_returns_201_with_all_fields():
    """Admin crea un atributo con todos los campos opcionales."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()

    session = AsyncMock()
    session.get.return_value = _fake_team()
    session.add = MagicMock(side_effect=lambda a: setattr(a, "id", 1))
    session.refresh = AsyncMock(side_effect=lambda a: None)

    # refresh must populate the returned object's fields
    async def _refresh(obj):
        obj.id = 1
        obj.team_id = 10
        obj.name = "Triples"
        obj.short_name = "3P"
        obj.description = "Triples anotados"
        obj.color = "violet"
        obj.type = "count"
        obj.archived_at = None
        obj.created_at = attr.created_at

    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/stat-attributes",
        json={"name": "Triples", "short_name": "3P", "description": "Triples anotados", "color": "violet"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Triples"
    assert body["short_name"] == "3P"
    assert body["description"] == "Triples anotados"
    assert body["color"] == "violet"
    assert body["type"] == "count"


def test_create_stat_attribute_minimal_body():
    """Crear atributo solo con name — short_name, description y color opcionales."""
    _override_user(_fake_admin())

    async def _refresh(obj):
        obj.id = 2
        obj.team_id = 10
        obj.name = "Rebotes"
        obj.short_name = None
        obj.description = None
        obj.color = None
        obj.type = "count"
        obj.archived_at = None
        obj.created_at = datetime.now(UTC)

    session = AsyncMock()
    session.get.return_value = _fake_team()
    session.add = MagicMock()
    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/stat-attributes",
        json={"name": "Rebotes"},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    assert r.json()["short_name"] is None


def test_create_stat_attribute_requires_coach_or_td():
    """Staff member (no HC/TD) → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.return_value = _fake_team()
    session.scalar = AsyncMock(return_value=None)  # sin perfil HC/TD
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/stat-attributes",
        json={"name": "Triples"},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_create_stat_attribute_empty_name_returns_422():
    """Nombre vacío → 422 validación Pydantic."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.return_value = _fake_team()
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/stat-attributes",
        json={"name": ""},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_create_stat_attribute_short_name_too_long_returns_422():
    """short_name > 10 caracteres → 422."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.return_value = _fake_team()
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/stat-attributes",
        json={"name": "Triples", "short_name": "TOOLONGNAME"},  # 11 chars
        headers=_auth_headers(),
    )
    assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# PATCH /clubs/{id}/teams/{tid}/stat-attributes/{attr_id}
# ═══════════════════════════════════════════════════════════════════════════════

def test_update_stat_attribute_returns_200():
    """Admin renombra un atributo y actualiza sus metadatos."""
    _override_user(_fake_admin())
    team = _fake_team()
    attr = _fake_stat_attr()

    async def _refresh(obj):
        obj.name = "Triples anotados"
        obj.short_name = "3PT"
        obj.description = "Descripción actualizada"
        obj.color = "blue"

    session = AsyncMock()
    session.get.side_effect = [team, attr]  # _get_team_or_404, then attr
    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/stat-attributes/1",
        json={"name": "Triples anotados", "short_name": "3PT", "description": "Descripción actualizada", "color": "blue"},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Triples anotados"
    assert body["short_name"] == "3PT"
    assert body["color"] == "blue"


def test_update_stat_attribute_not_found_returns_404():
    """Atributo inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), None]  # team found, attr not found
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/stat-attributes/999",
        json={"name": "Nuevo nombre"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_update_stat_attribute_wrong_team_returns_404():
    """Atributo pertenece a otro equipo → 404."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr(team_id=99)  # diferente team_id

    session = AsyncMock()
    session.get.side_effect = [_fake_team(team_id=10), attr]
    _override_db(session)

    r = TestClient(app).patch(
        "/clubs/1/teams/10/stat-attributes/1",
        json={"name": "Nuevo nombre"},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# DELETE /clubs/{id}/teams/{tid}/stat-attributes/{attr_id}
# ═══════════════════════════════════════════════════════════════════════════════

def test_archive_stat_attribute_returns_204():
    """Admin archiva un atributo — archived_at queda establecido."""
    _override_user(_fake_admin())
    team = _fake_team()
    attr = _fake_stat_attr()

    session = AsyncMock()
    session.get.side_effect = [team, attr]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/stat-attributes/1", headers=_auth_headers())
    assert r.status_code == 204
    assert attr.archived_at is not None


def test_archive_stat_attribute_not_found_returns_404():
    """Atributo inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), None]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/stat-attributes/999", headers=_auth_headers())
    assert r.status_code == 404


def test_archive_stat_attribute_already_archived_returns_404():
    """Atributo ya archivado → 404 (no se puede re-archivar)."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()
    attr.archived_at = datetime.now(UTC)  # ya archivado

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), attr]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/stat-attributes/1", headers=_auth_headers())
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET /clubs/{id}/teams/{tid}/matches/{mid}/custom-stats
# ═══════════════════════════════════════════════════════════════════════════════

def test_list_custom_match_stats_returns_empty():
    """Admin obtiene lista vacía de custom stats para un partido."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match()]
    scalars_result = MagicMock()
    scalars_result.all.return_value = []
    session.scalars = AsyncMock(return_value=scalars_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches/5/custom-stats", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


def test_list_custom_match_stats_returns_list():
    """Admin obtiene las stats existentes."""
    _override_user(_fake_admin())
    stat = _fake_custom_stat()
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match()]
    scalars_result = MagicMock()
    scalars_result.all.return_value = [stat]
    session.scalars = AsyncMock(return_value=scalars_result)
    _override_db(session)

    r = TestClient(app).get("/clubs/1/teams/10/matches/5/custom-stats", headers=_auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["value"] == 3
    assert body[0]["player_id"] == 42


def test_list_custom_match_stats_requires_auth():
    """Sin token → 401."""
    r = TestClient(app).get("/clubs/1/teams/10/matches/5/custom-stats")
    assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# PUT /clubs/{id}/teams/{tid}/matches/{mid}/custom-stats
# ═══════════════════════════════════════════════════════════════════════════════

def test_upsert_custom_stat_creates_with_player_id():
    """Admin crea una nueva custom stat para jugador del equipo local."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()

    async def _refresh(obj):
        obj.id = 1
        obj.match_id = 5
        obj.stat_attribute_id = 1
        obj.player_id = 42
        obj.opponent_player_id = None
        obj.value = 2
        obj.created_at = datetime.now(UTC)

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match(), attr]
    session.scalar = AsyncMock(return_value=None)  # no existing stat
    session.add = MagicMock()
    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "player_id": 42, "value": 2},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["player_id"] == 42
    assert body["opponent_player_id"] is None
    assert body["value"] == 2


def test_upsert_custom_stat_creates_with_opponent_player_id():
    """Admin crea una custom stat para jugador rival."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()

    async def _refresh(obj):
        obj.id = 2
        obj.match_id = 5
        obj.stat_attribute_id = 1
        obj.player_id = None
        obj.opponent_player_id = 77
        obj.value = 1
        obj.created_at = datetime.now(UTC)

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match(), attr]
    session.scalar = AsyncMock(return_value=None)  # no existing stat
    session.add = MagicMock()
    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "opponent_player_id": 77, "value": 1},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["opponent_player_id"] == 77
    assert body["player_id"] is None
    assert body["value"] == 1


def test_upsert_custom_stat_updates_existing():
    """Stat ya existente → se actualiza el valor."""
    _override_user(_fake_admin())
    attr = _fake_stat_attr()
    existing = _fake_custom_stat(value=1)

    async def _refresh(obj):
        pass  # existing ya tiene los campos correctos

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match(), attr]
    session.scalar = AsyncMock(return_value=existing)  # stat preexistente
    session.refresh = AsyncMock(side_effect=_refresh)
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "player_id": 42, "value": 5},
        headers=_auth_headers(),
    )
    assert r.status_code == 200
    assert existing.value == 5  # valor actualizado en el objeto


def test_upsert_custom_stat_both_player_ids_returns_422():
    """Enviar player_id Y opponent_player_id a la vez → 422 (validador Pydantic)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "player_id": 42, "opponent_player_id": 77, "value": 1},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_upsert_custom_stat_no_player_id_returns_422():
    """No enviar ningún player_id → 422 (validador Pydantic)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "value": 1},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


def test_upsert_custom_stat_unknown_attribute_returns_404():
    """Atributo de estadística inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), _fake_match(), None]  # attr not found
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 999, "player_id": 42, "value": 1},
        headers=_auth_headers(),
    )
    assert r.status_code == 404


def test_upsert_custom_stat_negative_value_returns_422():
    """Valor negativo → 422 (ge=0 en schema)."""
    _override_user(_fake_admin())
    session = AsyncMock()
    _override_db(session)

    r = TestClient(app).put(
        "/clubs/1/teams/10/matches/5/custom-stats",
        json={"stat_attribute_id": 1, "player_id": 42, "value": -1},
        headers=_auth_headers(),
    )
    assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# DELETE /clubs/{id}/teams/{tid}/matches/{mid}/custom-stats/{stat_id}
# ═══════════════════════════════════════════════════════════════════════════════

def test_delete_custom_stat_returns_204():
    """Admin elimina una custom stat."""
    _override_user(_fake_admin())
    stat = _fake_custom_stat()

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), stat]
    session.delete = AsyncMock()
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/matches/5/custom-stats/1", headers=_auth_headers())
    assert r.status_code == 204
    session.delete.assert_called_once_with(stat)


def test_delete_custom_stat_not_found_returns_404():
    """Stat inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_team(), None]  # stat not found
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/matches/5/custom-stats/999", headers=_auth_headers())
    assert r.status_code == 404


def test_delete_custom_stat_wrong_match_returns_404():
    """Stat pertenece a otro partido → 404."""
    _override_user(_fake_admin())
    stat = _fake_custom_stat(match_id=99)  # diferente match_id

    session = AsyncMock()
    session.get.side_effect = [_fake_team(), stat]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/matches/5/custom-stats/1", headers=_auth_headers())
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# POST /clubs/{id}/teams/{tid}/staff
# ═══════════════════════════════════════════════════════════════════════════════

def test_add_team_staff_returns_201_for_admin():
    """Admin añade un staff member al equipo."""
    _override_user(_fake_admin())
    member = _fake_club_member()
    season = _fake_season()
    enriched = _fake_enriched_profile()

    session = AsyncMock()
    # _get_club_or_404 → Club; db.get(Team) → team; db.get(Season) → season
    session.get.side_effect = [_fake_club(), _fake_team(), season]
    # db.scalar: ClubMember check, then Profile reload with relationships
    session.scalar = AsyncMock(side_effect=[member, enriched])
    session.add = MagicMock()
    session.flush = AsyncMock()
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/staff",
        json={"user_id": 99, "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "staff_member"
    assert body["user_email"] == "staff@example.com"


def test_add_team_staff_unknown_club_member_returns_404():
    """Usuario no es miembro del club → 404."""
    _override_user(_fake_admin())
    season = _fake_season()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), season]
    session.scalar = AsyncMock(return_value=None)  # ClubMember no encontrado
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/staff",
        json={"user_id": 999, "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 404
    assert "member" in r.json()["detail"].lower()


def test_add_team_staff_requires_coach_or_td():
    """Staff member (no HC/TD) → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team()]
    session.scalar = AsyncMock(return_value=None)  # sin perfil HC/TD
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/staff",
        json={"user_id": 99, "season_id": 3},
        headers=_auth_headers(),
    )
    assert r.status_code == 403


def test_add_team_staff_unknown_season_returns_404():
    """Temporada inexistente → 404."""
    _override_user(_fake_admin())
    member = _fake_club_member()

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), _fake_team(), None]  # season not found
    session.scalar = AsyncMock(return_value=member)
    _override_db(session)

    r = TestClient(app).post(
        "/clubs/1/teams/10/staff",
        json={"user_id": 99, "season_id": 999},
        headers=_auth_headers(),
    )
    assert r.status_code == 404
    assert "Season" in r.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════════
# DELETE /clubs/{id}/teams/{tid}/staff/{profile_id}
# ═══════════════════════════════════════════════════════════════════════════════

def test_remove_team_staff_returns_204():
    """Admin archiva el perfil de un staff member."""
    _override_user(_fake_admin())
    target = _fake_profile(role="staff_member")

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), target]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/staff/1", headers=_auth_headers())
    assert r.status_code == 204
    assert target.archived_at is not None


def test_remove_team_staff_not_found_returns_404():
    """Perfil inexistente → 404."""
    _override_user(_fake_admin())
    session = AsyncMock()
    session.get.side_effect = [_fake_club(), None]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/staff/999", headers=_auth_headers())
    assert r.status_code == 404


def test_remove_team_staff_head_coach_returns_422():
    """Intentar retirar a un HeadCoach via este endpoint → 422."""
    _override_user(_fake_admin())
    target = _fake_profile(role="head_coach")

    session = AsyncMock()
    session.get.side_effect = [_fake_club(), target]
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/staff/1", headers=_auth_headers())
    assert r.status_code == 422
    assert "staff_member" in r.json()["detail"]


def test_remove_team_staff_requires_coach_or_td():
    """Staff member (no HC/TD) intentando retirar a otro → 403."""
    _override_user(_fake_user())
    session = AsyncMock()
    session.get.side_effect = [_fake_club()]
    session.scalar = AsyncMock(return_value=None)  # sin perfil HC/TD
    _override_db(session)

    r = TestClient(app).delete("/clubs/1/teams/10/staff/1", headers=_auth_headers())
    assert r.status_code == 403
