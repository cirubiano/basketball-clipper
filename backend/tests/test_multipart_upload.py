"""
Tests del flujo multipart upload: init → (subir fuera del backend) →
complete/abort. No tocan S3 real — storage.* está mockeado.

Se ejecutan dentro del contenedor backend:

    docker compose run --rm backend pytest tests/test_multipart_upload.py -v
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.security import create_access_token, get_current_profile, get_current_user
from app.main import app
from app.models.profile import UserRole
from app.models.video import VideoStatus

# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id)
    return {"Authorization": f"Bearer {token}"}


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.email = "tester@example.com"
    return u


def _fake_profile(user_id: int = 1, team_id: int = 10, role=UserRole.staff_member) -> MagicMock:
    p = MagicMock()
    p.id = 1
    p.user_id = user_id
    p.club_id = 5
    p.team_id = team_id
    p.role = role
    return p


def _override_current_user(user: MagicMock):
    app.dependency_overrides[get_current_user] = lambda: user


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


# ── init-upload ───────────────────────────────────────────────────────────────

def test_init_upload_creates_video_and_returns_urls():
    profile = _fake_profile()
    _override_current_profile(profile)

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    _override_db_session(session)

    def _assign_id(video):
        video.id = 42

    session.add.side_effect = _assign_id

    with (
        patch("app.services.storage.create_multipart_upload", return_value="upload-id-xyz"),
        patch(
            "app.services.storage.generate_part_url",
            side_effect=lambda key, uid, n: f"https://s3/{key}?part={n}",
        ),
    ):
        client = TestClient(app)
        r = client.post(
            "/videos/init-upload",
            json={"title": "Test match", "filename": "partido.mp4", "size": 250 * 1024 * 1024},
            headers=_auth_headers(),
        )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["video_id"] == 42
    assert body["upload_id"] == "upload-id-xyz"
    assert body["total_parts"] == 3  # 250 MB / 100 MB = 3 partes
    assert len(body["urls"]) == 3
    assert body["urls"][0]["part_number"] == 1


def test_init_upload_rejected_for_technical_director():
    """TechnicalDirector no tiene equipo → 403."""
    profile = _fake_profile(team_id=None, role=UserRole.technical_director)
    _override_current_profile(profile)
    _override_db_session(AsyncMock())

    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"title": "Test", "filename": "partido.mp4", "size": 1024 * 1024},
        headers=_auth_headers(),
    )
    assert r.status_code == 403
    assert "Technical directors" in r.json()["detail"]


def test_init_upload_rejects_unsupported_extension():
    _override_current_profile(_fake_profile())
    _override_db_session(AsyncMock())

    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"title": "Test", "filename": "foo.exe", "size": 1000},
        headers=_auth_headers(),
    )
    assert r.status_code == 422
    assert "Formato no soportado" in r.json()["detail"]


def test_init_upload_rejects_file_too_big():
    _override_current_profile(_fake_profile())
    _override_db_session(AsyncMock())

    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"title": "Test", "filename": "big.mp4", "size": 100 * 1024**3},  # 100 GB
        headers=_auth_headers(),
    )
    assert r.status_code == 413


# ── complete-upload ───────────────────────────────────────────────────────────

def test_complete_upload_closes_multipart_and_enqueues_job():
    user = _fake_user()
    _override_current_user(user)

    mock_video = MagicMock()
    mock_video.id = 7
    mock_video.user_id = user.id
    mock_video.s3_key = "videos/1/xyz.mp4"
    mock_video.upload_id = "upload-id-7"
    mock_video.status = VideoStatus.uploading
    mock_video.created_at = datetime.now(UTC)

    session = AsyncMock()
    session.get.return_value = mock_video
    session.commit = AsyncMock()
    _override_db_session(session)

    with (
        patch("app.services.storage.complete_multipart_upload"),
        patch("app.services.queue.process_video.delay") as mock_enqueue,
    ):
        client = TestClient(app)
        r = client.post(
            "/videos/7/complete-upload",
            json={"parts": [
                {"part_number": 1, "etag": "\"abc\""},
                {"part_number": 2, "etag": "\"def\""},
            ]},
            headers=_auth_headers(),
        )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == 7
    assert body["status"] == "pending"
    mock_enqueue.assert_called_once_with(7)
    assert mock_video.status == VideoStatus.pending
    assert mock_video.upload_id is None


def test_complete_upload_rejects_video_not_in_uploading_state():
    user = _fake_user()
    _override_current_user(user)

    mock_video = MagicMock()
    mock_video.user_id = user.id
    mock_video.status = VideoStatus.pending
    mock_video.upload_id = "upload-id"

    session = AsyncMock()
    session.get.return_value = mock_video
    _override_db_session(session)

    client = TestClient(app)
    r = client.post(
        "/videos/1/complete-upload",
        json={"parts": [{"part_number": 1, "etag": "\"x\""}]},
        headers=_auth_headers(),
    )
    assert r.status_code == 409


# ── abort-upload ──────────────────────────────────────────────────────────────

def test_abort_upload_calls_storage_and_marks_error():
    user = _fake_user()
    _override_current_user(user)

    mock_video = MagicMock()
    mock_video.user_id = user.id
    mock_video.s3_key = "videos/1/abc.mp4"
    mock_video.upload_id = "upload-id-abort"

    session = AsyncMock()
    session.get.return_value = mock_video
    session.commit = AsyncMock()
    _override_db_session(session)

    with patch("app.services.storage.abort_multipart_upload") as mock_abort:
        client = TestClient(app)
        r = client.post("/videos/5/abort-upload", headers=_auth_headers())

    assert r.status_code == 204
    mock_abort.assert_called_once_with("videos/1/abc.mp4", "upload-id-abort")
    assert mock_video.status == VideoStatus.error
    assert mock_video.upload_id is None


# ── upload-status ─────────────────────────────────────────────────────────────

def test_upload_status_lists_already_uploaded_parts():
    user = _fake_user()
    _override_current_user(user)

    mock_video = MagicMock()
    mock_video.id = 3
    mock_video.user_id = user.id
    mock_video.s3_key = "videos/1/foo.mp4"
    mock_video.upload_id = "upload-id-3"
    mock_video.status = VideoStatus.uploading

    session = AsyncMock()
    session.get.return_value = mock_video
    _override_db_session(session)

    fake_parts = [
        {"PartNumber": 1, "ETag": "\"abc\"", "Size": 100},
        {"PartNumber": 2, "ETag": "\"def\"", "Size": 100},
    ]
    with patch("app.services.storage.list_parts", return_value=fake_parts):
        client = TestClient(app)
        r = client.get("/videos/3/upload-status", headers=_auth_headers())

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["upload_id"] == "upload-id-3"
    assert len(body["uploaded_parts"]) == 2


# ── Autorización ──────────────────────────────────────────────────────────────

def test_user_cannot_access_another_users_video():
    _override_current_user(_fake_user(user_id=1))

    mock_video = MagicMock()
    mock_video.user_id = 99  # pertenece a otro usuario
    session = AsyncMock()
    session.get.return_value = mock_video
    _override_db_session(session)

    client = TestClient(app)
    r = client.post("/videos/1/abort-upload", headers=_auth_headers(user_id=1))
    assert r.status_code == 404
