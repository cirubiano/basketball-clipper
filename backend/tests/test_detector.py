"""
Tests for app.services.detector.

Pure-function helpers (_determine_possession, _fill_with_horizon,
_smooth_possession, _to_segments, _cluster_team_colors) son testeados
sin mocking. detect_possessions se prueba con YOLO mockeado.
"""
from unittest.mock import MagicMock, patch

import numpy as np

from app.services.detector import (
    _cluster_team_colors,
    _determine_possession,
    _fill_with_horizon,
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
    assert _determine_possession(players, (50, 50), CENTROIDS) == "team_a"


def test_determine_possession_team_b_closest_centroid():
    players = [{"color": (200.0, 200.0, 200.0), "center": (50, 50)}]
    assert _determine_possession(players, (50, 50), CENTROIDS) == "team_b"


def test_determine_possession_picks_closest_player_to_ball():
    players = [
        {"color": (200.0, 200.0, 200.0), "center": (10, 10)},   # team_b lejos
        {"color": (10.0, 20.0, 30.0), "center": (100, 100)},    # team_a cerca del balón
    ]
    assert _determine_possession(players, (100, 100), CENTROIDS) == "team_a"


# ── _fill_with_horizon ────────────────────────────────────────────────────────

def test_fill_with_horizon_fills_short_gaps():
    seq = [(0, "team_a"), (5, None), (10, "team_b")]
    result = _fill_with_horizon(seq, max_fill=3)
    teams = [t for _, t in result]
    # El None se rellena con team_a (forward-fill desde el frame 0)
    assert teams == ["team_a", "team_a", "team_b"]


def test_fill_with_horizon_does_not_cross_long_gaps():
    """Más de max_fill frames consecutivos sin label → permanecen None."""
    seq = [(0, "team_a")] + [(i * 5, None) for i in range(1, 10)] + [(50, "team_b")]
    result = _fill_with_horizon(seq, max_fill=2)
    teams = [t for _, t in result]
    # Los 2 primeros None se rellenan con team_a; el resto siguen None
    assert teams[0] == "team_a"
    assert teams[1] == "team_a"
    assert teams[2] == "team_a"
    # A partir de aquí el horizonte se agotó
    assert teams[3] is None
    assert teams[-1] == "team_b"


def test_fill_with_horizon_backfills_leading_nones():
    seq = [(0, None), (5, None), (10, "team_b")]
    result = _fill_with_horizon(seq, max_fill=5)
    assert result[0][1] == "team_b"
    assert result[1][1] == "team_b"


def test_fill_with_horizon_keeps_all_nones_when_no_label_known():
    seq = [(0, None), (5, None), (10, None)]
    result = _fill_with_horizon(seq, max_fill=5)
    assert all(t is None for _, t in result)


# ── _smooth_possession ────────────────────────────────────────────────────────

def test_smooth_preserves_frame_indices():
    seq = [(0, "team_a"), (5, "team_a"), (10, "team_b")]
    result = _smooth_possession(seq, window=1)
    assert [f for f, _ in result] == [0, 5, 10]


def test_smooth_majority_vote_filters_single_flip():
    seq = [(i * 5, "team_a" if i != 2 else "team_b") for i in range(7)]
    result = _smooth_possession(seq, window=5)
    teams = [t for _, t in result]
    # El flip aislado en el centro queda absorbido
    assert teams[3] == "team_a"


def test_smooth_returns_none_when_window_only_has_nones():
    seq = [(0, None), (5, None), (10, None)]
    result = _smooth_possession(seq, window=3)
    assert all(t is None for _, t in result)


# ── _to_segments ──────────────────────────────────────────────────────────────

def test_to_segments_basic_two_teams():
    smoothed = [(0, "team_a"), (5, "team_a"), (10, "team_b"), (15, "team_b"), (20, "team_b")]
    segments = _to_segments(smoothed, fps=1.0, min_sec=2.0)
    assert len(segments) == 2
    assert segments[0][2] == "team_a"
    assert segments[1][2] == "team_b"


def test_to_segments_respects_min_segment_duration():
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


def test_to_segments_none_gap_breaks_segment():
    """Un hueco con None debe romper el segmento, generando dos clips del mismo equipo."""
    smoothed = [
        (0, "team_a"), (5, "team_a"), (10, "team_a"),  # bloque 1
        (15, None), (20, None),                          # gap
        (25, "team_a"), (30, "team_a"), (35, "team_a"),  # bloque 2
    ]
    segments = _to_segments(smoothed, fps=1.0, min_sec=2.0)
    assert len(segments) == 2
    assert all(team == "team_a" for _, _, team in segments)


# ── _cluster_team_colors ──────────────────────────────────────────────────────

def test_cluster_team_colors_returns_two_centroids():
    colors = [(float(i), float(i * 2), float(i * 3)) for i in range(20)]
    centroids = _cluster_team_colors(colors)
    assert centroids.shape == (2, 3)


def test_cluster_team_colors_separates_two_groups():
    group_a = [(10.0 + i, 10.0 + i, 10.0 + i) for i in range(10)]
    group_b = [(200.0 + i, 200.0 + i, 200.0 + i) for i in range(10)]
    centroids = _cluster_team_colors(group_a + group_b)
    dist = float(np.linalg.norm(centroids[0] - centroids[1]))
    assert dist > 100


# ── detect_possessions (integration with mocked YOLO) ────────────────────────

def test_detect_possessions_returns_list(sample_video_path):
    mock_result = MagicMock()
    mock_result.boxes = []
    mock_model = MagicMock(return_value=[mock_result])

    with patch("app.services.detector.YOLO", return_value=mock_model):
        result = detect_possessions(sample_video_path)

    assert isinstance(result, list)


def test_detect_possessions_with_player_detections(sample_video_path):
    def make_box(cls_id, x1, y1, x2, y2, conf=0.9):
        box = MagicMock()
        box.cls = [cls_id]
        box.conf = [conf]
        box.xyxy = [np.array([x1, y1, x2, y2], dtype=float)]
        return box

    mock_result = MagicMock()
    mock_result.boxes = [
        make_box(0, 40, 80, 100, 180),
        make_box(0, 220, 80, 280, 180),
        make_box(32, 150, 110, 170, 130),
    ]
    mock_model = MagicMock(return_value=[mock_result])

    with patch("app.services.detector.YOLO", return_value=mock_model):
        result = detect_possessions(sample_video_path)

    assert isinstance(result, list)
    for start, end, team in result:
        assert end > start
        assert team in ("team_a", "team_b")
