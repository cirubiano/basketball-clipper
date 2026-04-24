"""
Video clip cutter — FFmpeg via ffmpeg-python.

Cuts one MP4 clip per possession segment. Uses fast input seeking (``-ss``
before ``-i``) combined with H.264 re-encoding so the resulting clips start
and end on exact frames. ``+faststart`` moves the moov atom to the file header
for immediate browser playback.
"""
import logging
import os

import ffmpeg

logger = logging.getLogger(__name__)


def cut_clips(
    video_path: str,
    segments: list[tuple[float, float, str]],
    output_dir: str,
) -> list[str]:
    """
    Cuts one MP4 clip per segment.

    Args:
        video_path: Absolute path to the source video file.
        segments: List of ``(start_seconds, end_seconds, team_label)`` tuples
                  as produced by ``detector.detect_possessions``.
        output_dir: Directory where output clips will be written (must exist).

    Returns:
        List of output file paths in the same order as *segments*.
        If FFmpeg fails on a segment the exception propagates immediately.
    """
    output_paths: list[str] = []

    for idx, (start_sec, end_sec, team) in enumerate(segments):
        duration = end_sec - start_sec
        if duration <= 0:
            logger.warning("cutter: skipping segment %d — zero/negative duration", idx)
            continue

        output_path = os.path.join(output_dir, f"clip_{idx:04d}_{team}.mp4")

        try:
            (
                ffmpeg
                # Fast seek: place -ss BEFORE -i so FFmpeg seeks at container
                # level before decoding, then re-encodes only the needed frames
                # for frame-accurate start/end points.
                .input(video_path, ss=start_sec)
                .output(
                    output_path,
                    t=duration,
                    vcodec="libx264",
                    acodec="aac",
                    preset="fast",
                    crf=23,           # good quality / size trade-off
                    movflags="+faststart",  # moov atom at start for web streaming
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            output_paths.append(output_path)
            logger.debug(
                "cutter: clip_%04d_%s  %.1f–%.1f s (%.1f s)",
                idx, team, start_sec, end_sec, duration,
            )

        except ffmpeg.Error as exc:
            stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
            logger.error("cutter: ffmpeg error on segment %d: %s", idx, stderr)
            raise RuntimeError(
                f"FFmpeg failed on segment {idx} ({start_sec:.1f}–{end_sec:.1f}s): {stderr[:200]}"
            ) from exc

    logger.info("cutter: produced %d clips from %d segments", len(output_paths), len(segments))
    return output_paths
