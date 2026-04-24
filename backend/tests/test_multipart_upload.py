"""
Tests del flujo multipart upload: init → (subir fuera del backend) →
complete/abort. No tocan S3 real — storage.* está mockeado.

Se ejecutan dentro del contenedor backend:

    docker compose run --rm backend pytest tests/test_multipart_upload.py -v
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.main import app
from app.models.video import VideoStatus


# ── Helpers ──────────────────────────────────────────────────────────────────

def _auth_headers(user_id: int = 1) -> dict[str, str]:
    token = create_access_token(subject=user_id)
    return {"Authorization": f"Bearer {token}"}


def _fake_user(user_id: int = 1) -> MagicMock:
    u = MagicMock()
    u.id = user_id
    u.email = "tester@example.com"
    return u


def _override_current_user(user: MagicMock):
    """Reemplaza la dependencia get_current_user sin tocar la BD."""
    from app.core.security import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user


def _override_db_session(session: AsyncMock):
    """Reemplaza get_db para que devuelva un AsyncSession mockeado."""
    from app.core.database import get_db

    async def _dep():
        yield session

    app.dependency_overrides[get_db] = _dep


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── init-upload ──────────────────────────────────────────────────────────────

def test_init_upload_creates_video_and_returns_urls():
    user = _fake_user()
    _override_current_user(user)

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    _override_db_session(session)

    with (
        patch(
            "app.services.storage.create_multipart_upload",
            return_value="upload-id-xyz",
        ),
        patch(
            "app.services.storage.generate_part_url",
            side_effect=lambda key, uid, n: f"https://s3/{key}?part={n}&sig=...",
        ),
    ):
        # Stub: tras db.flush(), el video tiene id=42
        def _assign_id(video):
            video.id = 42

        session.add.side_effect = _assign_id

        client = TestClient(app)
        r = client.post(
            "/videos/init-upload",
            json={"filename": "partido.mp4", "size": 250 * 1024 * 1024},  # 250 MB
            headers=_auth_headers(),
        )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["video_id"] == 42
    assert body["upload_id"] == "upload-id-xyz"
    assert body["part_size"] == 100 * 1024 * 1024
    assert body["total_parts"] == 3  # 250 MB / 100 MB = 3 partes
    assert len(body["urls"]) == 3
    assert body["urls"][0]["part_number"] == 1


def test_init_upload_rejects_unsupported_extension():
    _override_current_user(_fake_user())
    _override_db_session(AsyncMock())
    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"filename": "foo.exe", "size": 1000},
        headers=_auth_headers(),
    )
    assert r.status_code == 422
    assert "Formato no soportado" in r.json()["detail"]


def test_init_upload_rejects_file_too_big():
    _override_current_user(_fake_user())
    _override_db_session(AsyncMock())
    client = TestClient(app)
    r = client.post(
        "/videos/init-upload",
        json={"filename": "big.mp4", "size": 100 * 1024**3},  # 100 GB
        headers=_auth_headers(),
    )
    assert r.status_code == 413


# ── complete-upload ──────────────────────────────────────────────────────────

def test_complete_upload_closes_multipart_and_enqueues_job():
    user = _fake_user()
    _override_current_user(user)

    from datetime import datetime, timezone
    mock_video = MagicMock()
    mock_video.id = 7
    mock_video.user_id = user.id
    mock_video.s3_key = "videos/1/xyz.mp4"
    mock_video.upload_id = "upload-id-7"
    mock_video.status = VideoStatus.uploading
    mock_video.created_at = datetime.now(timezone.utc)

    session = AsyncMock()
    session.get.return_value = mock_video
    session.commit = AsyncMock()
    _override_db_session(session)

    with (
        patch("app.services.storage.complete_multipart_upload") as mock_complete,
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

    mock_complete.assert_called_once()
    args = mock_complete.call_args.args
    assert args[0] == "videos/1/xyz.mp4"
    assert args[1] == "upload-id-7"
    # Las partes se pasan a storage con el formato S3 {"PartNumber", "ETag"}
    assert args[2] == [
        {"PartNumber": 1, "ETag": "\"abc\""},
        {"PartNumber": 2, "ETag": "\"def\""},
    ]

    mock_enqueue.assert_called_once_with(7)
    assert mock_video.status == VideoStatus.pending
    assert mock_video.upload_id is None


def test_complete_upload_rejects_video_not_in_uploading_state():
    user = _fake_user()
    _override_current_user(user)

    mock_video = MagicMock()
    mock_video.user_id = user.id
    mock_video.status = VideoStatus.pending  # ya no está en uploading
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


# ── abort-upload ─────────────────────────────────────────────────────────────

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


# ── upload-status (reanudación) ──────────────────────────────────────────────

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
    assert body["uploaded_parts"][0]["part_number"] == 1


# ── Autorización ─────────────────────────────────────────────────────────────

def test_user_cannot_access_another_users_video():
    # Usuario autenticado id=1, pero el video pertenece a user_id=99
    _override_current_user(_fake_user(user_id=1))

    mock_video = MagicMock()
    mock_video.user_id = 99  # distinto
    session = AsyncMock()
    session.get.return_value = mock_video
    _override_db_session(session)

    client = TestClient(app)
    r = client.post("/videos/1/abort-upload", headers=_auth_headers(user_id=1))
    assert r.status_code == 404
