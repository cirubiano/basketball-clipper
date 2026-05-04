"""
Integration tests for the full video processing pipeline (_run_pipeline).

All external dependencies (DB, Redis, S3, YOLO, FFmpeg) are mocked so the
suite runs without any infrastructure. Tests cover orchestration only:
status transitions, early-exit paths, sequencing of stages.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.video import VideoStatus
from app.services.queue import _run_pipeline

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_session_mock(video_mock):
    session = AsyncMock()
    session.get.return_value = video_mock
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


def _make_engine_mock():
    engine = AsyncMock()
    engine.dispose = AsyncMock()
    return engine


def _patch_infrastructure(session_mock, engine_mock, tmp_path):
    return [
        patch("app.services.queue.redis.Redis.from_url", return_value=MagicMock()),
        patch("sqlalchemy.ext.asyncio.create_async_engine", return_value=engine_mock),
        patch(
            "sqlalchemy.ext.asyncio.async_sessionmaker",
            return_value=MagicMock(return_value=session_mock),
        ),
        patch("tempfile.mkdtemp", return_value=str(tmp_path)),
        patch("shutil.rmtree"),
    ]


# ── Happy path ────────────────────────────────────────────────────────────────

async def test_pipeline_happy_path_sets_status_completed(tmp_path):
    mock_video = MagicMock()
    mock_video.id = 1
    mock_video.user_id = 42
    mock_video.filename = "game.mp4"
    mock_video.s3_key = "videos/42/1/game.mp4"

    fake_segments = [(0.0, 10.0, "team_a"), (12.0, 22.0, "team_b")]
    fake_clip_paths = [
        str(tmp_path / "clip_0000_team_a.mp4"),
        str(tmp_path / "clip_0001_team_b.mp4"),
    ]

    session = _make_session_mock(mock_video)
    engine = _make_engine_mock()

    with ExitStack() as stack:
        for ctx in _patch_infrastructure(session, engine, tmp_path):
            stack.enter_context(ctx)
        stack.enter_context(patch("app.services.storage.download_file"))
        stack.enter_context(patch("os.path.getsize", return_value=100 * 1024 * 1024))
        stack.enter_context(patch("app.services.detector.detect_possessions", return_value=fake_segments))
        stack.enter_context(patch("app.services.cutter.cut_clips", return_value=fake_clip_paths))
        mock_upload = stack.enter_context(patch("app.services.storage.upload_file"))
        stack.enter_context(patch("os.makedirs"))

        await _run_pipeline(1)

    assert mock_video.status == VideoStatus.completed
    assert mock_upload.call_count == len(fake_segments)


async def test_pipeline_happy_path_creates_correct_clip_s3_keys(tmp_path):
    mock_video = MagicMock()
    mock_video.id = 7
    mock_video.user_id = 99
    mock_video.filename = "match.mp4"
    mock_video.s3_key = "videos/99/7/match.mp4"

    fake_segments = [(0.0, 8.0, "team_a")]
    fake_clip_paths = [str(tmp_path / "clip_0000_team_a.mp4")]

    session = _make_session_mock(mock_video)
    engine = _make_engine_mock()

    with ExitStack() as stack:
        for ctx in _patch_infrastructure(session, engine, tmp_path):
            stack.enter_context(ctx)
        stack.enter_context(patch("app.services.storage.download_file"))
        stack.enter_context(patch("os.path.getsize", return_value=100 * 1024 * 1024))
        stack.enter_context(patch("app.services.detector.detect_possessions", return_value=fake_segments))
        stack.enter_context(patch("app.services.cutter.cut_clips", return_value=fake_clip_paths))
        mock_upload = stack.enter_context(patch("app.services.storage.upload_file"))
        stack.enter_context(patch("os.makedirs"))

        await _run_pipeline(7)

    upload_call = mock_upload.call_args_list[0]
    s3_key = upload_call.args[1]
    assert "clips/99/7/" in s3_key
    assert s3_key.endswith("clip_0000_team_a.mp4")


# ── Sin segmentos → error ─────────────────────────────────────────────────────

async def test_pipeline_marks_error_when_no_segments_detected(tmp_path):
    mock_video = MagicMock()
    mock_video.id = 3
    mock_video.user_id = 1
    mock_video.filename = "game.mp4"
    mock_video.s3_key = "videos/1/3/game.mp4"

    session = _make_session_mock(mock_video)
    engine = _make_engine_mock()

    with ExitStack() as stack:
        for ctx in _patch_infrastructure(session, engine, tmp_path):
            stack.enter_context(ctx)
        stack.enter_context(patch("app.services.storage.download_file"))
        stack.enter_context(patch("os.path.getsize", return_value=100 * 1024 * 1024))
        stack.enter_context(patch("app.services.detector.detect_possessions", return_value=[]))
        mock_cut = stack.enter_context(patch("app.services.cutter.cut_clips"))
        stack.enter_context(patch("os.makedirs"))

        await _run_pipeline(3)

    assert mock_video.status == VideoStatus.error
    mock_cut.assert_not_called()


# ── Video no encontrado ──────────────────────────────────────────────────────

async def test_pipeline_exits_gracefully_when_video_not_found(tmp_path):
    session = _make_session_mock(video_mock=None)
    engine = _make_engine_mock()

    with ExitStack() as stack:
        for ctx in _patch_infrastructure(session, engine, tmp_path):
            stack.enter_context(ctx)
        mock_download = stack.enter_context(patch("app.services.storage.download_file"))
        stack.enter_context(patch("os.makedirs"))

        await _run_pipeline(999)

    mock_download.assert_not_called()


# ── Excepción inesperada → error ─────────────────────────────────────────────

async def test_pipeline_marks_error_on_unexpected_exception(tmp_path):
    mock_video = MagicMock()
    mock_video.id = 4
    mock_video.user_id = 1
    mock_video.filename = "game.mp4"
    mock_video.s3_key = "videos/1/4/game.mp4"

    session = _make_session_mock(mock_video)
    engine = _make_engine_mock()

    with ExitStack() as stack:
        for ctx in _patch_infrastructure(session, engine, tmp_path):
            stack.enter_context(ctx)
        stack.enter_context(patch(
            "app.services.storage.download_file",
            side_effect=RuntimeError("S3 unreachable"),
        ))
        stack.enter_context(patch("os.makedirs"))

        with pytest.raises(RuntimeError, match="S3 unreachable"):
            await _run_pipeline(4)

    assert mock_video.status == VideoStatus.error
    assert "S3 unreachable" in mock_video.error_message
