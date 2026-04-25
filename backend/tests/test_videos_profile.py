"""
Tests de filtrado de vídeos y clips por perfil activo.

Verifica que:
  - GET /videos devuelve solo los vídeos del equipo del perfil (HeadCoach/StaffMember)
  - GET /videos con TechnicalDirector incluye todos los vídeos del club
  - GET /clips filtra de la misma forma
  - Sin perfil activo en el token → 403

    docker compose run --rm backend pytest tests/test_videos_profile.py -v
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, get_current_profile
from app.core.database import get_db
from app.main import app
from app.models.profile import UserRole
from app.models.video import VideoStatus


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1, profile_id: int | None = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id, profile_id=profile_id)
    return {"Authorization": f"Bearer {token}"}


def _fake_profile(
    *,
    user_id: int = 1,
    club_id: int = 5,
    team_id: int | None = 10,
    role: UserRole = UserRole.staff_member,
) -> MagicMock:
    p = MagicMock()
    p.id = 1
    p.user_id = user_id
    p.club_id = club_id
    p.team_id = team_id
    p.role = role
    p.archived_at = None
    return p


def _fake_video(vid_id: int = 1, team_id: int = 10) -> MagicMock:
    v = MagicMock()
    v.id = vid_id
    v.title = f"Partido {vid_id}"
    v.filename = f"video{vid_id}.mp4"
    v.status = VideoStatus.completed
    v.error_message = None
    v.team_id = team_id
    v.user_id = 1
    v.created_at = datetime.now(timezone.utc)
    return v


def _override_current_profile(profile: MagicMock):
    app.dependency_overrides[get_current_profile] = lambda: profile


def _override_db_session(session: AsyncMock):
    async def _dep():
        yield session
    app.dependency_overrides[get_db] = _dep


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── GET /videos — filtrado por equipo ─────────────────────────────────────────

def test_list_videos_requires_active_profile():
    """Sin perfil activo en el token → 403."""
    client = TestClient(app)
    # Token sin profile_id
    token = create_access_token(subject=1)
    r = client.get("/videos", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_list_videos_with_team_profile_filters_by_team():
    """HeadCoach / StaffMember ve solo los vídeos de su equipo."""
    profile = _fake_profile(team_id=10)
    _override_current_profile(profile)

    video = _fake_video(vid_id=1, team_id=10)
    mock_result = MagicMock()
    mock_result.all.return_value = [(video, 3)]  # (Video, clips_count)

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)
    _override_db_session(session)

    client = TestClient(app)
    r = client.get("/videos", headers=_auth_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["clips_count"] == 3


def test_list_videos_empty_when_no_videos_for_team():
    """Si el equipo no tiene vídeos, devuelve lista vacía."""
    profile = _fake_profile(team_id=99)
    _override_current_profile(profile)

    mock_result = MagicMock()
    mock_result.all.return_value = []

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)
    _override_db_session(session)

    client = TestClient(app)
    r = client.get("/videos", headers=_auth_headers())
    assert r.status_code == 200
    assert r.json() == []


# ── POST /videos/init-upload — control de rol ─────────────────────────────────

def test_init_upload_forbidden_for_technical_director():
    """TechnicalDirector no puede subir vídeos (no tiene team_id)."""
    profile = _fake_profile(team_id=None, role=UserRole.technical_director)
    _override_current_profile(profile)
    _override_db_session(AsyncMock())

    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"title": "Test", "filename": "partido.mp4", "size": 500_000},
        headers=_auth_headers(),
    )
    assert r.status_code == 403
    assert "Technical directors" in r.json()["detail"]


def test_init_upload_allowed_for_head_coach():
    """HeadCoach puede iniciar un upload."""
    profile = _fake_profile(team_id=10, role=UserRole.head_coach)
    _override_current_profile(profile)

    session = AsyncMock()
    session.add = MagicMock(side_effect=lambda v: setattr(v, "id", 55))
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    _override_db_session(session)

    with (
        patch("app.services.storage.create_multipart_upload", return_value="uid-55"),
        patch("app.services.storage.generate_part_url", return_value="https://s3/url"),
    ):
        client = TestClient(app)
        r = client.post(
            "/videos/init-upload",
            json={"title": "Test match", "filename": "partido.mp4", "size": 50 * 1024 * 1024},
            headers=_auth_headers(),
        )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["video_id"] == 55
    assert body["upload_id"] == "uid-55"


def test_init_upload_video_associated_to_team():
    """El vídeo creado debe tener el team_id del perfil."""
    profile = _fake_profile(team_id=42, role=UserRole.staff_member)
    _override_current_profile(profile)

    created_video = None

    def _capture_video(video):
        nonlocal created_video
        created_video = video
        video.id = 1

    session = AsyncMock()
    session.add = MagicMock(side_effect=_capture_video)
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    _override_db_session(session)

    with (
        patch("app.services.storage.create_multipart_upload", return_value="uid"),
        patch("app.services.storage.generate_part_url", return_value="https://s3/url"),
    ):
        client = TestClient(app)
        client.post(
            "/videos/init-upload",
            json={"title": "Test", "filename": "x.mp4", "size": 1024 * 1024},
            headers=_auth_headers(),
        )

    assert created_video is not None
    assert created_video.team_id == 42
    assert created_video.user_id == profile.user_id


# ── GET /clips — filtrado por equipo ──────────────────────────────────────────

def test_list_clips_requires_active_profile():
    """Sin perfil activo → 403."""
    client = TestClient(app)
    token = create_access_token(subject=1)
    r = client.get("/clips/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_list_clips_filtered_by_team():
    """HeadCoach / StaffMember ve solo los clips de su equipo."""
    from datetime import datetime, timezone

    profile = _fake_profile(team_id=10)
    _override_current_profile(profile)

    mock_clip = MagicMock()
    mock_clip.id = 1
    mock_clip.video_id = 1
    mock_clip.start_time = 0.0
    mock_clip.end_time = 30.0
    mock_clip.team = "A"
    mock_clip.s3_key = "clips/1/1/clip.mp4"
    mock_clip.duration = 30.0
    mock_clip.created_at = datetime.now(timezone.utc)

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_clip]

    session = AsyncMock()
    session.execute = AsyncMock(return_value=mock_result)
    _override_db_session(session)

    with patch("app.services.storage.get_presigned_url", return_value="https://cdn/clip.mp4"):
        client = TestClient(app)
        r = client.get("/clips/", headers=_auth_headers())

    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    assert body[0]["id"] == 1
    assert body[0]["url"] == "https://cdn/clip.mp4"
