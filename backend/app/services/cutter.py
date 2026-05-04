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

Thumbnails
----------
Despues de cortar cada clip, ``extract_thumbnail`` extrae un fotograma JPEG
del punto medio del clip. El thumbnail se usa en la UI para scanning visual
de la lista de clips sin necesidad de cargar el video completo.
"""
import logging
import os
from collections.abc import Callable

import ffmpeg

logger = logging.getLogger(__name__)


ClipProgressCallback = Callable[[int, int], None]
"""(current_clip_index_1based, total_clips) -- invocado al terminar cada clip."""


def cut_clips(
    video_path: str,
    segments: list[tuple[float, float, str]],
    output_dir: str,
    on_progress: ClipProgressCallback | None = None,
) -> list[str]:
    """
    Cuts one MP4 clip per segment using stream copy.

    Args:
        video_path: ruta absoluta al video fuente.
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
                .input(video_path, ss=start_sec)
                .output(
                    output_path,
                    t=duration,
                    c="copy",
                    avoid_negative_ts="make_zero",
                    movflags="+faststart",
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


def extract_thumbnail(clip_path: str, output_dir: str, clip_name: str) -> str | None:
    """
    Extrae un fotograma JPEG del punto medio del clip dado.

    Usa seek exacto al 50% de la duracion del clip. La imagen resultante se
    escala a 320x180 (16:9) para reducir el tamano de almacenamiento
    manteniendo buena resolucion para thumbnails.

    Args:
        clip_path: ruta al archivo MP4 del clip.
        output_dir: directorio de salida (debe existir).
        clip_name: nombre base del clip (sin extension) para el archivo JPEG.

    Returns:
        Ruta al JPEG generado, o ``None`` si FFmpeg falla (no es bloqueante).
    """
    thumb_path = os.path.join(output_dir, f"{clip_name}.jpg")

    try:
        probe = ffmpeg.probe(clip_path)
        duration = float(probe["format"].get("duration", 0))
        seek_pos = max(0.0, duration / 2.0)

        (
            ffmpeg
            .input(clip_path, ss=seek_pos)
            .output(
                thumb_path,
                vframes=1,
                vf="scale=320:180",
                format="image2",
                vcodec="mjpeg",
                q=3,
            )
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True, quiet=True)
        )

        if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
            logger.debug("cutter: thumbnail extracted for %s (%.1fs)", clip_name, seek_pos)
            return thumb_path

        logger.warning("cutter: thumbnail for %s is empty, skipping", clip_name)
        return None

    except Exception as exc:  # noqa: BLE001
        logger.warning("cutter: thumbnail extraction failed for %s: %s", clip_name, exc)
        return None
