"""
Possession detector — YOLOv8 + OpenCV.

Algorithm
---------
1. Sample every STRIDE-th frame to keep processing time reasonable.
2. Run YOLOv8n on each sampled frame to detect persons (cls 0) and the
   sports ball (cls 32 in COCO).
3. Extract the mean HSV colour of each detected player's torso region.
4. After the full scan, run K-means (K=2) on all collected torso colours to
   find the two team centroids.
5. For each sampled frame determine which team is in possession: find the
   player closest to the ball and map their jersey colour to a team.
6. Fill gaps (frames with no ball detected) by forward-filling the last known
   possession, then smooth with a sliding-window majority vote.
7. Collapse the smoothed sequence into contiguous (start_sec, end_sec, team)
   segments, discarding any shorter than MIN_SEGMENT_SEC.
"""
import logging
from collections import Counter
from typing import Callable

import cv2
import numpy as np
import torch

# ── Compatibilidad ultralytics 8.2.x + torch 2.6+ ─────────────────────────────
# PyTorch 2.6 cambio el default de torch.load(..., weights_only=False) a
# True, rompiendo la carga de los checkpoints oficiales de YOLOv8 con
# ultralytics<8.3.63. TODO: quitar este shim cuando subamos a >=8.3.63.
_orig_torch_load = torch.load


def _compat_torch_load(*args, **kwargs):  # type: ignore[no-untyped-def]
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(*args, **kwargs)


torch.load = _compat_torch_load  # type: ignore[assignment]

from ultralytics import YOLO  # noqa: E402

logger = logging.getLogger(__name__)

# ── Tuning constants ──────────────────────────────────────────────────────────
STRIDE = 5
CONF_THRESHOLD = 0.4
MIN_SEGMENT_SEC = 2.0
SMOOTH_WINDOW = 15

# Con cuantos sampled frames reportamos progreso (1 de cada N).
_PROGRESS_EVERY = 25

# COCO class indices
_PERSON_CLS = 0
_BALL_CLS = 32


ProgressCallback = Callable[[int, int], None]
"""(current_frame, total_frames) — ambos en unidades de frame del vídeo."""


def detect_possessions(
    video_path: str,
    on_progress: ProgressCallback | None = None,
) -> list[tuple[float, float, str]]:
    """
    Returns ``(start_seconds, end_seconds, team_label)`` tuples.

    Args:
        video_path: ruta local al vídeo.
        on_progress: callback opcional invocado con (frame_actual, total_frames)
            cada ~25 sampled frames para que el caller publique progreso.
    """
    model = YOLO("yolov8n.pt")

    cap = cv2.VideoCapture(video_path)
    fps: float = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    logger.info(
        "detector: start  fps=%.1f  total_frames=%d  video=%s",
        fps, total_frames, video_path,
    )

    all_jersey_colors: list[tuple[float, float, float]] = []
    raw_detections: list[tuple[int, list[dict], tuple[int, int] | None]] = []

    frame_idx = 0
    sample_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % STRIDE == 0:
            players, ball_center = _detect_frame(model, frame)
            raw_detections.append((frame_idx, players, ball_center))
            all_jersey_colors.extend(p["color"] for p in players)
            sample_idx += 1

            # Reportar progreso cada N sampled frames para no saturar Redis
            if on_progress and (sample_idx % _PROGRESS_EVERY == 0):
                on_progress(frame_idx, total_frames)

        frame_idx += 1

    cap.release()
    # Último progreso al 100% del scan
    if on_progress:
        on_progress(total_frames, total_frames)

    logger.info(
        "detector: scan done — %d frames processed, %d sampled, %d colour samples",
        frame_idx, len(raw_detections), len(all_jersey_colors),
    )

    if len(all_jersey_colors) < 10:
        logger.warning("detector: too few colour samples — cannot determine teams")
        return []

    centroids = _cluster_team_colors(all_jersey_colors)
    possession_seq: list[tuple[int, str | None]] = [
        (frame_idx, _determine_possession(players, ball_center, centroids))
        for frame_idx, players, ball_center in raw_detections
    ]
    smoothed = _smooth_possession(possession_seq, SMOOTH_WINDOW)
    return _to_segments(smoothed, fps, MIN_SEGMENT_SEC)


# ── Per-frame helpers ─────────────────────────────────────────────────────────

def _detect_frame(
    model: YOLO,
    frame,
) -> tuple[list[dict], tuple[int, int] | None]:
    results = model(frame, verbose=False, classes=[_PERSON_CLS, _BALL_CLS])[0]

    players: list[dict] = []
    ball_center: tuple[int, int] | None = None

    for box in results.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        if conf < CONF_THRESHOLD:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0])

        if cls == _PERSON_CLS:
            h = y2 - y1
            torso_y1 = y1 + h // 4
            torso_y2 = y1 + 3 * h // 4
            torso = frame[torso_y1:torso_y2, x1:x2]
            if torso.size == 0:
                continue
            torso_hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
            mean_color: tuple[float, float, float] = cv2.mean(torso_hsv)[:3]
            players.append(
                {
                    "color": mean_color,
                    "center": ((x1 + x2) // 2, (y1 + y2) // 2),
                }
            )

        elif cls == _BALL_CLS:
            ball_center = ((x1 + x2) // 2, (y1 + y2) // 2)

    return players, ball_center


def _cluster_team_colors(
    colors: list[tuple[float, float, float]],
) -> np.ndarray:
    arr = np.array(colors, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
    _, _labels, centroids = cv2.kmeans(
        arr, 2, None, criteria, attempts=10, flags=cv2.KMEANS_PP_CENTERS
    )
    return centroids


def _determine_possession(
    players: list[dict],
    ball_center: tuple[int, int] | None,
    centroids: np.ndarray,
) -> str | None:
    if not players or ball_center is None:
        return None

    bx, by = ball_center
    closest = min(
        players,
        key=lambda p: (p["center"][0] - bx) ** 2 + (p["center"][1] - by) ** 2,
    )

    color = np.array(closest["color"], dtype=np.float32)
    d0 = float(np.linalg.norm(color - centroids[0]))
    d1 = float(np.linalg.norm(color - centroids[1]))
    return "team_a" if d0 <= d1 else "team_b"


# ── Smoothing and segmentation ────────────────────────────────────────────────

def _smooth_possession(
    seq: list[tuple[int, str | None]],
    window: int,
) -> list[tuple[int, str]]:
    teams: list[str | None] = [t for _, t in seq]

    last: str | None = None
    for i, t in enumerate(teams):
        if t is not None:
            last = t
        elif last is not None:
            teams[i] = last

    last = None
    for i in range(len(teams) - 1, -1, -1):
        if teams[i] is not None:
            last = teams[i]
        elif last is not None:
            teams[i] = last

    teams = [t or "team_a" for t in teams]

    half = window // 2
    smoothed_teams: list[str] = []
    for i in range(len(teams)):
        window_slice = teams[max(0, i - half) : i + half + 1]
        most_common = Counter(window_slice).most_common(1)[0][0]
        smoothed_teams.append(most_common)

    frame_indices = [f for f, _ in seq]
    return list(zip(frame_indices, smoothed_teams))


def _to_segments(
    smoothed: list[tuple[int, str]],
    fps: float,
    min_sec: float,
) -> list[tuple[float, float, str]]:
    if not smoothed:
        return []

    segments: list[tuple[float, float, str]] = []
    seg_start_frame, current_team = smoothed[0]

    for i in range(1, len(smoothed)):
        frame_idx, team = smoothed[i]
        if team != current_team:
            start_sec = seg_start_frame / fps
            end_sec = smoothed[i - 1][0] / fps
            if end_sec - start_sec >= min_sec:
                segments.append((start_sec, end_sec, current_team))
            current_team = team
            seg_start_frame = frame_idx

    start_sec = seg_start_frame / fps
    end_sec = smoothed[-1][0] / fps
    if end_sec - start_sec >= min_sec:
        segments.append((start_sec, end_sec, current_team))

    logger.info("detector: found %d possession segments", len(segments))
    return segments
