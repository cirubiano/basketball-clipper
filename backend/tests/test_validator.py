"""
Tests for app.services.validator.

The Anthropic client and cv2.VideoCapture are mocked so no real video file or
API key is needed for most tests.  The sample_video_path fixture (conftest.py)
provides a real synthetic video to exercise the frame-extraction helpers.
"""
import base64
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.services.validator import (
    _extract_frames_b64,
    _resize_frame,
    validate_basketball_video,
)


# ── _resize_frame ─────────────────────────────────────────────────────────────

def test_resize_frame_shrinks_large_image():
    frame = np.zeros((1000, 800, 3), dtype=np.uint8)
    result = _resize_frame(frame, max_side=100)
    assert max(result.shape[:2]) <= 100


def test_resize_frame_preserves_aspect_ratio():
    frame = np.zeros((400, 200, 3), dtype=np.uint8)
    result = _resize_frame(frame, max_side=200)
    h, w = result.shape[:2]
    assert h == 200
    assert w == 100


def test_resize_frame_leaves_small_image_unchanged():
    frame = np.zeros((100, 80, 3), dtype=np.uint8)
    result = _resize_frame(frame, max_side=200)
    assert result.shape == frame.shape


# ── _extract_frames_b64 ───────────────────────────────────────────────────────

def test_extract_frames_b64_returns_valid_base64(sample_video_path):
    frames = _extract_frames_b64(sample_video_path, 3)
    assert len(frames) > 0
    for f in frames:
        decoded = base64.standard_b64decode(f)
        assert len(decoded) > 0


def test_extract_frames_b64_honours_count(sample_video_path):
    frames = _extract_frames_b64(sample_video_path, 3)
    # May be slightly less than requested if the video is very short
    assert 1 <= len(frames) <= 3


def test_extract_frames_b64_empty_video(tmp_path):
    bad = str(tmp_path / "empty.mp4")
    with open(bad, "wb") as fh:
        fh.write(b"\x00" * 64)
    frames = _extract_frames_b64(bad, 5)
    assert frames == []


# ── validate_basketball_video ─────────────────────────────────────────────────

def _make_mock_client(answer: str):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=answer)]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response
    return mock_client


def test_validate_returns_true_when_claude_says_yes(sample_video_path):
    with patch("anthropic.Anthropic", return_value=_make_mock_client("yes")):
        assert validate_basketball_video(sample_video_path) is True


def test_validate_returns_true_for_yes_with_whitespace(sample_video_path):
    with patch("anthropic.Anthropic", return_value=_make_mock_client("  Yes\n")):
        assert validate_basketball_video(sample_video_path) is True


def test_validate_returns_false_when_claude_says_no(sample_video_path):
    with patch("anthropic.Anthropic", return_value=_make_mock_client("no")):
        assert validate_basketball_video(sample_video_path) is False


def test_validate_returns_false_for_unreadable_video(tmp_path):
    bad = str(tmp_path / "garbage.mp4")
    with open(bad, "wb") as fh:
        fh.write(b"\xff" * 128)
    # No frames → should return False without calling Claude
    with patch("anthropic.Anthropic") as mock_cls:
        result = validate_basketball_video(bad)
    assert result is False
    mock_cls.assert_not_called()
