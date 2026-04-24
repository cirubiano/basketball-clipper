"""
Video clip cutter — FFmpeg via ffmpeg-python.

Modo de corte
-------------
Usa ``-c copy`` (stream copy) para evitar re-encoding. Un corte de un clip
de varios minutos pasa de ~3 minutos en CPU (libx264) a <1 segundo: FFmpeg
solo demuxea/remuxea los packets sin tocar las muestras.

Trade-off conocido
~~~~~~~~~~~~~~~~~~
Con stream copy, el clip empieza en el keyframe anterior al ``start_sec``
solicitado (no exactamente en ese instante). El desfase suele ser <2s
porque los partidos se graban con GOP corto. Para análisis táctico de
posesiones esto es aceptable. Si en el futuro hace falta precisión
frame-accurate, basta con cambiar las opciones de ``output()`` a
``vcodec="libx264", crf=23, preset="fast"`` (el coste es el tiempo).
"""
import logging
import os
from typing import Callable

import ffmpeg

logger = logging.getLogger(__name__)


ClipProgressCallback = Callable[[int, int], None]
"""(current_clip_index_1based, total_clips) — invocado al terminar cada clip."""


def cut_clips(
    video_path: str,
    segments: list[tuple[float, float, str]],
    output_dir: str,
    on_progress: ClipProgressCallback | None = None,
) -> list[str]:
    """
    Cuts one MP4 clip per segment using stream copy.

    Args:
        video_path: ruta absoluta al vídeo fuente.
        segments: lista de ``(start_seconds, end_seconds, team_label)``.
        output_dir: directorio donde escribir los clips (debe existir).
        on_progress: callback opcional invocado al terminar cada clip con
            ``(idx_1based, total)``.

    Returns:
        Lista de rutas de salida en el mismo orden que ``segments``.
    """
    output_paths: list[str] = []
    total = len(segments)

    for idx, (start_sec, end_sec, team) in enumerate(segments):
        duration = end_sec - start_sec
        if duration <= 0:
            logger.warning("cutter: skipping segment %d (zero/negative duration)", idx)
            continue

        output_path = os.path.join(output_dir, f"clip_{idx:04d}_{team}.mp4")

        try:
            (
                ffmpeg
                # Fast seek (-ss antes de -i) busca a nivel de container,
                # luego copia los streams sin re-encodear.
                .input(video_path, ss=start_sec)
                .output(
                    output_path,
                    t=duration,
                    c="copy",                # Sin re-encoding
                    avoid_negative_ts="make_zero",
                    movflags="+faststart",   # moov atom al inicio para streaming web
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True, quiet=True)
            )
            output_paths.append(output_path)
            logger.debug(
                "cutter: clip_%04d_%s  %.1f-%.1fs (%.1fs)",
                idx, team, start_sec, end_sec, duration,
            )

            if on_progress:
                on_progress(idx + 1, total)

        except ffmpeg.Error as exc:
            stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
            logger.error("cutter: ffmpeg error on segment %d: %s", idx, stderr)
            raise RuntimeError(
                f"FFmpeg failed on segment {idx} ({start_sec:.1f}-{end_sec:.1f}s): {stderr[:200]}"
            ) from exc

    logger.info("cutter: produced %d clips from %d segments", len(output_paths), len(segments))
    return output_paths
