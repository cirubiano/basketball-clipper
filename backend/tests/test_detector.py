"""
Tests for app.services.detector.

Pure-function helpers (_determine_possession, _smooth_possession, _to_segments,
_cluster_team_colors) are tested without any mocking.
detect_possessions is tested with YOLO mocked out.
"""
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.services.detector import (
    _cluster_team_colors,
    _determine_possession,
    _smooth_possession,
    _to_segments,
    detect_possessions,
)


# ── _determine_possession ─────────────────────────────────────────────────────

CENTROIDS = np.array([[10.0, 20.0, 30.0], [200.0, 200.0, 200.0]], dtype=np.float32)


def test_determine_possession_returns_none_when_no_ball():
    players = [{"color": (10.0, 20.0, 30.0), "center": (100, 100)}]
    assert _determine_possession(players, None, CENTROIDS) is None


def test_determine_possession_returns_none_when_no_players():
    assert _determine_possession([], (100, 100), CENTROIDS) is None


def test_determine_possession_team_a_closest_centroid():
    players = [{"color": (10.0, 20.0, 30.0), "center": (50, 50)}]
    result = _determine_possession(players, (50, 50), CENTROIDS)
    assert result == "team_a"


def test_determine_possession_team_b_closest_centroid():
    players = [{"color": (200.0, 200.0, 200.0), "center": (50, 50)}]
    result = _determine_possession(players, (50, 50), CENTROIDS)
    assert result == "team_b"


def test_determine_possession_picks_closest_player_to_ball():
    players = [
        {"color": (200.0, 200.0, 200.0), "center": (10, 10)},   # team_b, far from ball
        {"color": (10.0, 20.0, 30.0), "center": (100, 100)},    # team_a, near ball
    ]
    result = _determine_possession(players, (100, 100), CENTROIDS)
    assert result == "team_a"


# ── _smooth_possession ────────────────────────────────────────────────────────

def test_smooth_possession_fills_none_with_forward_fill():
    seq = [(0, "team_a"), (5, None), (10, "team_b")]
    result = _smooth_possession(seq, window=1)
    teams = [t for _, t in result]
    assert None not in teams


def test_smooth_possession_backward_fills_leading_nones():
    seq = [(0, None), (5, None), (10, "team_b")]
    result = _smooth_possession(seq, window=1)
    assert result[0][1] == "team_b"
    assert result[1][1] == "team_b"


def test_smooth_possession_all_nones_defaults_to_team_a():
    seq = [(0, None), (5, None)]
    result = _smooth_possession(seq, window=1)
    for _, t in result:
        assert t == "team_a"


def test_smooth_possession_preserves_frame_indices():
    seq = [(0, "team_a"), (5, "team_a"), (10, "team_b")]
    result = _smooth_possession(seq, window=1)
    assert [f for f, _ in result] == [0, 5, 10]


def test_smooth_possession_majority_vote_smooths_noise():
    # Single-frame flip surrounded by team_a should be smoothed away
    seq = [(i * 5, "team_a" if i != 2 else "team_b") for i in range(7)]
    result = _smooth_possession(seq, window=5)
    teams = [t for _, t in result]
    # Middle frame should be smoothed to team_a
    assert teams[3] == "team_a"


# ── _to_segments ──────────────────────────────────────────────────────────────

def test_to_segments_basic_two_teams():
    smoothed = [(0, "team_a"), (5, "team_a"), (10, "team_b"), (15, "team_b"), (20, "team_b")]
    segments = _to_segments(smoothed, fps=1.0, min_sec=2.0)
    assert len(segments) == 2
    assert segments[0][2] == "team_a"
    assert segments[1][2] == "team_b"


def test_to_segments_respects_min_segment_duration():
    # team_a only lasts 1 second (below min_sec=2.0)
    smoothed = [(0, "team_a"), (1, "team_b"), (10, "team_b"), (20, "team_b")]
    segments = _to_segments(smoothed, fps=1.0, min_sec=2.0)
    for start, end, _ in segments:
        assert end - start >= 2.0


def test_to_segments_empty_input():
    assert _to_segments([], fps=30.0, min_sec=2.0) == []


def test_to_segments_single_team_entire_video():
    smoothed = [(i * 5, "team_a") for i in range(10)]
    segments = _to_segments(smoothed, fps=1.0, min_sec=2.0)
    assert len(segments) == 1
    assert segments[0][2] == "team_a"


# ── _cluster_team_colors ──────────────────────────────────────────────────────

def test_cluster_team_colors_returns_two_centroids():
    colors = [(float(i), float(i * 2), float(i * 3)) for i in range(20)]
    centroids = _cluster_team_colors(colors)
    assert centroids.shape == (2, 3)


def test_cluster_team_colors_separates_two_groups():
    # Group 1: colours near (10, 10, 10); Group 2: colours near (200, 200, 200)
    group_a = [(10.0 + i, 10.0 + i, 10.0 + i) for i in range(10)]
    group_b = [(200.0 + i, 200.0 + i, 200.0 + i) for i in range(10)]
    centroids = _cluster_team_colors(group_a + group_b)
    # The two centroids should be far apart
    dist = float(np.linalg.norm(centroids[0] - centroids[1]))
    assert dist > 100


# ── detect_possessions (integration with mocked YOLO) ────────────────────────

def test_detect_possessions_returns_list(sample_video_path):
    """
    Runs detect_possessions against a real synthetic video with YOLO mocked
    to return no detections.  Expects an empty list (too few colour samples)
    rather than an exception.
    """
    mock_result = MagicMock()
    mock_result.boxes = []
    mock_model = MagicMock(return_value=[mock_result])

    with patch("app.services.detector.YOLO", return_value=mock_model):
        result = detect_possessions(sample_video_path)

    assert isinstance(result, list)


def test_detect_possessions_with_player_detections(sample_video_path):
    """
    Mocks YOLO to return two player detections per frame.  The detector should
    produce at least one possession segment from 30 frames of footage.
    """
    def make_box(cls_id, x1, y1, x2, y2, conf=0.9):
        box = MagicMock()
        box.cls = [cls_id]
        box.conf = [conf]
        box.xyxy = [np.array([x1, y1, x2, y2], dtype=float)]
        return box

    mock_result = MagicMock()
    mock_result.boxes = [
        make_box(0, 40, 80, 100, 180),   # player (team A area)
        make_box(0, 220, 80, 280, 180),  # player (team B area)
        make_box(32, 150, 110, 170, 130),  # ball
    ]
    mock_model = MagicMock(return_value=[mock_result])

    with patch("app.services.detector.YOLO", return_value=mock_model):
        result = detect_possessions(sample_video_path)

    assert isinstance(result, list)
    for start, end, team in result:
        assert end > start
        assert team in ("team_a", "team_b")
