"""
Tests for app.services.cutter.

ffmpeg.input is mocked so no FFmpeg binary or real video file is required.
"""
from unittest.mock import MagicMock, patch

import ffmpeg
import pytest

from app.services.cutter import cut_clips


def _ffmpeg_mock():
    """Returns a mock chain that mimics ffmpeg-python's fluent API."""
    stream = MagicMock()
    stream.output.return_value = stream
    stream.overwrite_output.return_value = stream
    stream.run.return_value = (b"", b"")
    return stream


# ── Happy path ────────────────────────────────────────────────────────────────

def test_cut_clips_returns_output_paths(tmp_path):
    segments = [(0.0, 5.0, "team_a"), (6.0, 12.0, "team_b")]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream):
        paths = cut_clips("source.mp4", segments, str(tmp_path))

    assert len(paths) == 2
    assert paths[0].endswith("clip_0000_team_a.mp4")
    assert paths[1].endswith("clip_0001_team_b.mp4")


def test_cut_clips_passes_correct_seek_and_duration(tmp_path):
    segments = [(10.0, 20.0, "team_a")]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream) as mock_input:
        cut_clips("source.mp4", segments, str(tmp_path))

    mock_input.assert_called_once_with("source.mp4", ss=10.0)
    _, out_kwargs = stream.output.call_args
    assert out_kwargs["t"] == pytest.approx(10.0)


def test_cut_clips_uses_stream_copy_and_faststart(tmp_path):
    """Cutter uses stream copy (-c copy) for speed; moov atom at start for streaming."""
    segments = [(0.0, 5.0, "team_a")]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream):
        cut_clips("source.mp4", segments, str(tmp_path))

    _, out_kwargs = stream.output.call_args
    assert out_kwargs["c"] == "copy"
    assert out_kwargs["movflags"] == "+faststart"


def test_cut_clips_multiple_segments_sequential_indices(tmp_path):
    segments = [
        (0.0, 4.0, "team_a"),
        (5.0, 10.0, "team_b"),
        (11.0, 20.0, "team_a"),
    ]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream):
        paths = cut_clips("source.mp4", segments, str(tmp_path))

    assert len(paths) == 3
    assert "clip_0000_" in paths[0]
    assert "clip_0001_" in paths[1]
    assert "clip_0002_" in paths[2]


# ── Edge cases ────────────────────────────────────────────────────────────────

def test_cut_clips_skips_zero_duration_segment(tmp_path):
    segments = [(5.0, 5.0, "team_a")]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream) as mock_input:
        paths = cut_clips("source.mp4", segments, str(tmp_path))

    assert paths == []
    mock_input.assert_not_called()


def test_cut_clips_skips_negative_duration_segment(tmp_path):
    segments = [(10.0, 5.0, "team_a")]
    stream = _ffmpeg_mock()

    with patch("ffmpeg.input", return_value=stream) as mock_input:
        paths = cut_clips("source.mp4", segments, str(tmp_path))

    assert paths == []
    mock_input.assert_not_called()


def test_cut_clips_empty_segments(tmp_path):
    with patch("ffmpeg.input") as mock_input:
        paths = cut_clips("source.mp4", [], str(tmp_path))
    assert paths == []
    mock_input.assert_not_called()


# ── Error handling ────────────────────────────────────────────────────────────

def test_cut_clips_raises_runtime_error_on_ffmpeg_failure(tmp_path):
    segments = [(0.0, 5.0, "team_a")]
    stream = _ffmpeg_mock()
    stream.run.side_effect = ffmpeg.Error("ffmpeg", b"", b"codec not found")

    with patch("ffmpeg.input", return_value=stream):
        with pytest.raises(RuntimeError, match="FFmpeg failed on segment 0"):
            cut_clips("source.mp4", segments, str(tmp_path))


def test_cut_clips_error_message_includes_time_range(tmp_path):
    segments = [(15.5, 30.0, "team_b")]
    stream = _ffmpeg_mock()
    stream.run.side_effect = ffmpeg.Error("ffmpeg", b"", b"error detail")

    with patch("ffmpeg.input", return_value=stream):
        with pytest.raises(RuntimeError, match="15.5"):
            cut_clips("source.mp4", segments, str(tmp_path))
