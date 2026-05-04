"""
Possession detector — YOLOv8 + OpenCV.

Pipeline
--------
1. Sample every STRIDE-th frame.
2. YOLOv8n detects persons (cls 0) and the sports ball (cls 32).
3. Player torso colour is sampled in **LAB** colour space — separates
   luminance from chroma so jersey colour matters more than lighting.
4. K-means (K=2) on jersey LAB values gives the two team centroids.
   We log the inter-centroid distance: if it's small, the teams aren't
   separable by colour and the labels will be noisy.
5. Possession label per sampled frame: jersey colour of the player
   nearest to the ball, mapped to a centroid.
6. Forward-fill ``None`` labels (no ball detected) but only for up to
   ``MAX_FILL_FRAMES`` consecutive frames. Beyond that, gaps stay null
   and the segment is broken — prevents 30s of "hidden ball" from
   collapsing two distinct possessions into one.
7. Sliding-window majority vote smooths single-frame noise.
8. Collapse into ``(start, end, team)`` tuples, dropping segments
   shorter than ``MIN_SEGMENT_SEC``.

All parameters (STRIDE, SMOOTH_WINDOW, MIN_SEGMENT_SEC, MAX_FILL_FRAMES)
are exposed via env vars so you can tune without redeploying. See
``app.core.config.Settings``.
"""
import logging
from collections import Counter, deque
from collections.abc import Callable

import cv2
import numpy as np
import torch

# ── Compatibilidad ultralytics 8.2.x + torch 2.6+ ─────────────────────────────
_orig_torch_load = torch.load


def _compat_torch_load(*args, **kwargs):  # type: ignore[no-untyped-def]
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(*args, **kwargs)


torch.load = _compat_torch_load  # type: ignore[assignment]

from ultralytics import YOLO  # noqa: E402

from app.core.config import settings  # noqa: E402

logger = logging.getLogger(__name__)

# ── Constantes ────────────────────────────────────────────────────────────────
_PERSON_CLS = 0
_BALL_CLS = 32
_PROGRESS_EVERY = 25  # cada N sampled frames reportamos progreso

ProgressCallback = Callable[[int, int], None]


def detect_possessions(
    video_path: str,
    on_progress: ProgressCallback | None = None,
) -> list[tuple[float, float, str]]:
    """
    Returns ``(start_seconds, end_seconds, team_label)`` tuples.
    """
    stride = settings.detector_stride
    smooth_window = settings.detector_smooth_window
    min_segment_sec = settings.detector_min_segment_sec
    max_fill = settings.detector_max_fill_frames
    yolo_model = settings.detector_yolo_model
    imgsz = settings.detector_imgsz
    person_conf = settings.detector_person_conf
    ball_conf = settings.detector_ball_conf
    ball_memory_frames = settings.detector_ball_memory_frames
    height_min_ratio = settings.detector_player_height_min_ratio
    height_max_ratio = settings.detector_player_height_max_ratio
    height_warmup = settings.detector_height_warmup_samples

    model = YOLO(yolo_model)

    cap = cv2.VideoCapture(video_path)
    fps: float = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    logger.info(
        "detector: start  fps=%.1f total_frames=%d stride=%d smooth=%d "
        "min_seg=%.1fs max_fill=%d model=%s imgsz=%d ball_conf=%.2f  video=%s",
        fps, total_frames, stride, smooth_window, min_segment_sec, max_fill,
        yolo_model, imgsz, ball_conf, video_path,
    )

    all_jersey_colors: list[tuple[float, float, float]] = []
    raw_detections: list[tuple[int, list[dict], tuple[int, int] | None]] = []
    ball_detected_count = 0
    max_ball_conf_seen = 0.0
    # Memoria del balón: posición del último avistamiento + cuántos sampled
    # frames lleva sin verse desde entonces.
    last_ball_center: tuple[int, int] | None = None
    sampled_since_last_ball = 0
    ball_memory_uses = 0  # diagnóstico: cuántos frames rescatamos por memoria
    # Deque deslizante con las alturas de personas detectadas. Se usa para
    # calcular la mediana on-the-fly y filtrar entrenadores/público.
    recent_heights: deque[float] = deque(maxlen=300)
    persons_total = 0
    persons_kept = 0

    frame_idx = 0
    sample_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % stride == 0:
            players, ball_center, ball_conf_seen = _detect_frame(
                model, frame, imgsz, person_conf, ball_conf,
            )
            if ball_conf_seen > max_ball_conf_seen:
                max_ball_conf_seen = ball_conf_seen

            # Filtro de personas no-jugadoras por altura. Los entrenadores
            # están cerca de cámara y son más altos en píxeles; el público
            # del fondo y el banquillo lejano son más pequeños. La mediana
            # de la ventana móvil define lo que es "altura típica de
            # jugadora" y descartamos lo que esté fuera de rango.
            persons_total += len(players)
            for pl in players:
                recent_heights.append(pl.get("height", 0.0))
            if len(recent_heights) >= height_warmup:
                sorted_heights = sorted(recent_heights)
                median_h = sorted_heights[len(sorted_heights) // 2]
                lo = median_h * height_min_ratio
                hi = median_h * height_max_ratio
                players = [
                    pl for pl in players
                    if lo <= pl.get("height", 0.0) <= hi
                ]
            persons_kept += len(players)

            # Memoria: si no detectamos balón pero lo vimos hace poco,
            # reutilizar última posición. Asume que el balón no se mueve
            # mucho entre frames consecutivos en juego fluido.
            if ball_center is not None:
                last_ball_center = ball_center
                sampled_since_last_ball = 0
                ball_detected_count += 1
                effective_ball = ball_center
            elif last_ball_center is not None and sampled_since_last_ball < ball_memory_frames:
                sampled_since_last_ball += 1
                ball_memory_uses += 1
                effective_ball = last_ball_center
            else:
                # La memoria caducó (o nunca hubo). Limpia para no usarla
                # cuando vuelva a aparecer un balón "nuevo" muy posterior.
                if sampled_since_last_ball >= ball_memory_frames:
                    last_ball_center = None
                    sampled_since_last_ball = 0
                effective_ball = None

            raw_detections.append((frame_idx, players, effective_ball))
            all_jersey_colors.extend(p["color"] for p in players)
            sample_idx += 1

            if on_progress and (sample_idx % _PROGRESS_EVERY == 0):
                on_progress(frame_idx, total_frames)

        frame_idx += 1

    cap.release()
    if on_progress:
        on_progress(total_frames, total_frames)

    sampled_count = len(raw_detections)
    ball_pct = (100.0 * ball_detected_count / sampled_count) if sampled_count else 0.0
    rescued_pct = (100.0 * ball_memory_uses / sampled_count) if sampled_count else 0.0
    logger.info(
        "detector: scan done — %d frames, %d sampled, %d colour samples, "
        "ball seen in %d/%d sampled (%.1f%%), %d rescatados por memoria (%.1f%%)",
        frame_idx, sampled_count, len(all_jersey_colors),
        ball_detected_count, sampled_count, ball_pct,
        ball_memory_uses, rescued_pct,
    )

    kept_pct = (100.0 * persons_kept / persons_total) if persons_total else 0.0
    logger.info(
        "detector: filtro altura — %d personas detectadas, %d aceptadas como "
        "jugadoras (%.1f%%). Resto: entrenadores cerca de cámara, banquillo, "
        "público o ruido. Tunear con DETECTOR_PLAYER_HEIGHT_MIN/MAX_RATIO si "
        "el porcentaje aceptado es muy bajo o muy alto.",
        persons_total, persons_kept, kept_pct,
    )

    logger.info(
        "detector: max ball confidence seen across video = %.3f "
        "(ball_conf threshold = %.2f). Si max_conf < threshold, el modelo "
        "ve la pelota pero no con suficiente confianza — bajar DETECTOR_BALL_CONF.",
        max_ball_conf_seen, ball_conf,
    )

    if ball_pct < 30.0:
        logger.warning(
            "detector: balón detectado solo en %.1f%% de los frames — "
            "YOLO está perdiendo la pelota. Opciones para arreglar: "
            "(1) DETECTOR_BALL_CONF más bajo si max_conf seen está cerca; "
            "(2) DETECTOR_IMGSZ=1920 (mas costoso, mejor recall); "
            "(3) DETECTOR_YOLO_MODEL=yolov8s.pt o yolov8m.pt.",
            ball_pct,
        )

    if len(all_jersey_colors) < 10:
        logger.warning("detector: too few colour samples — cannot determine teams")
        return []

    # ── K-means en LAB ────────────────────────────────────────────────
    centroids = _cluster_team_colors(all_jersey_colors)
    centroid_dist = float(np.linalg.norm(centroids[0] - centroids[1]))
    logger.info(
        "detector: K-means centroids (LAB) at distance %.2f — "
        "centroid_a=(%.0f,%.0f,%.0f) centroid_b=(%.0f,%.0f,%.0f)",
        centroid_dist,
        centroids[0][0], centroids[0][1], centroids[0][2],
        centroids[1][0], centroids[1][1], centroids[1][2],
    )
    if centroid_dist < 20.0:
        logger.warning(
            "detector: centroides de los dos equipos muy juntos (dist=%.1f) — "
            "los colores de camiseta no son distinguibles, posesiones serán ruidosas.",
            centroid_dist,
        )

    # ── Etiquetado de posesión por frame ──────────────────────────────
    possession_seq: list[tuple[int, str | None]] = [
        (fi, _determine_possession(players, ball_center, centroids))
        for fi, players, ball_center in raw_detections
    ]
    raw_a = sum(1 for _, t in possession_seq if t == "team_a")
    raw_b = sum(1 for _, t in possession_seq if t == "team_b")
    raw_none = sum(1 for _, t in possession_seq if t is None)
    logger.info(
        "detector: raw labels — team_a=%d team_b=%d none=%d",
        raw_a, raw_b, raw_none,
    )

    # ── Forward-fill con horizonte limitado ───────────────────────────
    filled = _fill_with_horizon(possession_seq, max_fill)
    filled_a = sum(1 for _, t in filled if t == "team_a")
    filled_b = sum(1 for _, t in filled if t == "team_b")
    filled_none = sum(1 for _, t in filled if t is None)
    logger.info(
        "detector: after fill (horizon=%d) — team_a=%d team_b=%d none=%d",
        max_fill, filled_a, filled_b, filled_none,
    )

    # ── Smoothing ─────────────────────────────────────────────────────
    smoothed = _smooth_possession(filled, smooth_window)

    # ── Segmentos ─────────────────────────────────────────────────────
    segments = _to_segments(smoothed, fps, min_segment_sec)
    return segments


# ── Per-frame helpers ─────────────────────────────────────────────────────────

def _detect_frame(
    model: YOLO,
    frame,
    imgsz: int,
    person_conf: float,
    ball_conf: float,
) -> tuple[list[dict], tuple[int, int] | None, float]:
    """
    Returns (players, ball_center, max_ball_conf_in_frame).
    El último valor sirve para diagnosticar si YOLO ve el balón pero con
    confianza insuficiente.
    """
    results = model(
        frame,
        verbose=False,
        classes=[_PERSON_CLS, _BALL_CLS],
        imgsz=imgsz,
        conf=min(person_conf, ball_conf),  # threshold permisivo; filtramos por clase abajo
    )[0]

    players: list[dict] = []
    # De todas las detecciones de balón en el frame, nos quedamos sólo con
    # la de máxima confianza para evitar falsos positivos por culpa del
    # threshold bajo.
    best_ball_center: tuple[int, int] | None = None
    best_ball_conf = 0.0
    max_ball_conf_seen = 0.0

    for box in results.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])

        x1, y1, x2, y2 = map(int, box.xyxy[0])

        if cls == _BALL_CLS:
            if conf > max_ball_conf_seen:
                max_ball_conf_seen = conf
            if conf >= ball_conf and conf > best_ball_conf:
                best_ball_conf = conf
                best_ball_center = ((x1 + x2) // 2, (y1 + y2) // 2)
            continue

        if cls != _PERSON_CLS or conf < person_conf:
            continue

        if cls == _PERSON_CLS:
            h = y2 - y1
            torso_y1 = y1 + h // 4
            torso_y2 = y1 + 3 * h // 4
            torso = frame[torso_y1:torso_y2, x1:x2]
            if torso.size == 0:
                continue
            # LAB separa luminancia (L) de croma (a, b). Para colores de
            # camiseta es más robusto frente a sombras/iluminación que HSV.
            torso_lab = cv2.cvtColor(torso, cv2.COLOR_BGR2LAB)
            mean_color: tuple[float, float, float] = cv2.mean(torso_lab)[:3]
            players.append(
                {
                    "color": mean_color,
                    "center": ((x1 + x2) // 2, (y1 + y2) // 2),
                    "height": float(y2 - y1),
                }
            )


    return players, best_ball_center, max_ball_conf_seen


def _cluster_team_colors(
    colors: list[tuple[float, float, float]],
) -> np.ndarray:
    """K-means K=2 sobre puntos LAB. Devuelve (2, 3) centroids."""
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


# ── Smoothing y segmentación ──────────────────────────────────────────────────

def _fill_with_horizon(
    seq: list[tuple[int, str | None]],
    max_fill: int,
) -> list[tuple[int, str | None]]:
    """
    Forward-fill ``None`` con la última label conocida, pero sólo hasta
    ``max_fill`` frames consecutivos. Más allá de ese umbral, el gap
    permanece como ``None`` — así dos posesiones separadas por un periodo
    largo sin balón quedan como segmentos distintos en vez de fusionarse.

    También hace backward-fill al inicio (Nones antes del primer label
    conocido), también con horizonte.
    """
    out: list[tuple[int, str | None]] = []
    last_label: str | None = None
    fill_used = 0

    for fi, t in seq:
        if t is not None:
            out.append((fi, t))
            last_label = t
            fill_used = 0
        elif last_label is not None and fill_used < max_fill:
            out.append((fi, last_label))
            fill_used += 1
        else:
            out.append((fi, None))

    # Backward-fill las leading Nones
    last_label = None
    fill_used = 0
    for i in range(len(out) - 1, -1, -1):
        fi, t = out[i]
        if t is not None:
            last_label = t
            fill_used = 0
        elif last_label is not None and fill_used < max_fill:
            out[i] = (fi, last_label)
            fill_used += 1
    return out


def _smooth_possession(
    seq: list[tuple[int, str | None]],
    window: int,
) -> list[tuple[int, str | None]]:
    """Sliding-window majority vote. Mantiene None si la mayoría es None."""
    teams = [t for _, t in seq]
    half = window // 2
    smoothed: list[str | None] = []
    for i in range(len(teams)):
        window_slice = [t for t in teams[max(0, i - half) : i + half + 1] if t is not None]
        if not window_slice:
            smoothed.append(None)
        else:
            smoothed.append(Counter(window_slice).most_common(1)[0][0])
    frame_indices = [f for f, _ in seq]
    return list(zip(frame_indices, smoothed, strict=False))


def _to_segments(
    smoothed: list[tuple[int, str | None]],
    fps: float,
    min_sec: float,
) -> list[tuple[float, float, str]]:
    """
    Convierte la secuencia de labels en segmentos contiguos del mismo equipo.
    Los gaps con None rompen segmentos (no se atraviesan).
    """
    if not smoothed:
        return []

    segments: list[tuple[float, float, str]] = []
    seg_start_frame: int | None = None
    current_team: str | None = None
    last_frame: int | None = None

    def flush(end_frame: int) -> None:
        if seg_start_frame is None or current_team is None:
            return
        start_sec = seg_start_frame / fps
        end_sec = end_frame / fps
        if end_sec - start_sec >= min_sec:
            segments.append((start_sec, end_sec, current_team))

    for fi, team in smoothed:
        if team is None:
            # Gap — cierra el segmento abierto si hay
            if current_team is not None and last_frame is not None:
                flush(last_frame)
                seg_start_frame = None
                current_team = None
        elif current_team is None:
            # Iniciamos un segmento
            seg_start_frame = fi
            current_team = team
        elif team != current_team:
            # Cambio de equipo
            if last_frame is not None:
                flush(last_frame)
            seg_start_frame = fi
            current_team = team
        last_frame = fi

    if current_team is not None and last_frame is not None:
        flush(last_frame)

    logger.info(
        "detector: found %d possession segments (min=%.1fs)",
        len(segments), min_sec,
    )
    return segments
