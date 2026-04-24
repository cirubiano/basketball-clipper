"""
Celery task que orquesta el pipeline de procesado de vídeo.

Flujo (sin validación previa, asume que el vídeo es baloncesto):

    Download -> detect_possessions -> cut_clips -> upload -> completed

Progreso publicado a Redis Pub/Sub ``video:{video_id}`` para el WebSocket.
El stage de detección emite progreso incremental a medida que YOLO analiza
frames (típicamente 5-10 minutos para un partido completo).
"""
import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path

import redis
from celery import Celery

from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "basketball_clipper",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)


# ── Celery entry point ────────────────────────────────────────────────────────

@celery_app.task(name="process_video", bind=True, max_retries=0)
def process_video(self, video_id: int) -> None:  # noqa: ARG002
    """Entrypoint sync de Celery — delega al pipeline async."""
    asyncio.run(_run_pipeline(video_id))


# ── Async pipeline ────────────────────────────────────────────────────────────

# Rango de progreso que cubre la detección YOLO (el stage más largo).
_DETECT_PROGRESS_START = 20
_DETECT_PROGRESS_END = 55


async def _run_pipeline(video_id: int) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    # Importar el paquete models entero garantiza que Base.metadata conozca
    # todas las tablas antes de cualquier flush (evita NoReferencedTableError
    # cuando una FK apunta a una tabla no importada).
    import app.models  # noqa: F401
    from app.models.clip import Clip
    from app.models.video import Video, VideoStatus
    from app.services import cutter, detector, storage

    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    tmp_dir: str | None = None
    pipeline_started = time.monotonic()

    try:
        async with async_session() as session:
            video: Video | None = await session.get(Video, video_id)
            if video is None:
                logger.error("[video %d] not found in DB, skipping", video_id)
                return

            tmp_dir = tempfile.mkdtemp(prefix=f"bc_video_{video_id}_")
            video_ext = Path(video.filename).suffix or ".mp4"
            video_local = os.path.join(tmp_dir, f"source{video_ext}")

            # ── Stage 1: Download ─────────────────────────────────────────
            logger.info("[video %d] stage 1/4: downloading from s3://%s", video_id, video.s3_key)
            _publish(r, video_id, "processing", 5)
            video.status = VideoStatus.processing
            await session.commit()

            t0 = time.monotonic()
            await asyncio.to_thread(storage.download_file, video.s3_key, video_local)
            size_mb = os.path.getsize(video_local) / 1024**2
            logger.info(
                "[video %d] stage 1/4: download done in %.1fs (%.1f MB)",
                video_id, time.monotonic() - t0, size_mb,
            )
            _publish(r, video_id, "processing", _DETECT_PROGRESS_START)

            # ── Stage 2: Detect possession segments ───────────────────────
            logger.info("[video %d] stage 2/4: detecting possessions with YOLOv8", video_id)
            t0 = time.monotonic()

            # Callback que el detector invoca cada N sampled frames.
            # Interpola el porcentaje entre _DETECT_PROGRESS_START y _END
            # según la fracción de frames ya procesados.
            def _on_detect_progress(current: int, total: int) -> None:
                frac = (current / total) if total > 0 else 1.0
                frac = min(max(frac, 0.0), 1.0)
                progress = _DETECT_PROGRESS_START + int(
                    frac * (_DETECT_PROGRESS_END - _DETECT_PROGRESS_START)
                )
                _publish(r, video_id, "processing", progress)

            segments: list[tuple[float, float, str]] = await asyncio.to_thread(
                detector.detect_possessions, video_local, _on_detect_progress,
            )
            logger.info(
                "[video %d] stage 2/4: detection done in %.1fs, %d segments found",
                video_id, time.monotonic() - t0, len(segments),
            )
            _publish(r, video_id, "processing", _DETECT_PROGRESS_END)

            if not segments:
                msg = "Could not detect any possession segments in the video."
                video.status = VideoStatus.error
                video.error_message = msg
                await session.commit()
                _publish(r, video_id, "error", 100, msg)
                logger.warning("[video %d] no segments detected, marking error", video_id)
                return

            # ── Stage 3: Cut clips ────────────────────────────────────────
            logger.info("[video %d] stage 3/4: cutting %d clips with FFmpeg", video_id, len(segments))
            clips_dir = os.path.join(tmp_dir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            # Callback que cutter invoca al terminar cada clip — interpola
            # progreso 55% → 75% según clips ya cortados.
            def _on_cut_progress(current: int, total: int) -> None:
                progress = 55 + int(20 * current / total)
                _publish(r, video_id, "processing", progress)

            t0 = time.monotonic()
            clip_paths: list[str] = await asyncio.to_thread(
                cutter.cut_clips, video_local, segments, clips_dir, _on_cut_progress,
            )
            logger.info(
                "[video %d] stage 3/4: cutting done in %.1fs, %d clips produced",
                video_id, time.monotonic() - t0, len(clip_paths),
            )
            _publish(r, video_id, "processing", 75)

            # ── Stage 4: Upload clips + create DB records ─────────────────
            logger.info("[video %d] stage 4/4: uploading %d clips to S3", video_id, len(clip_paths))
            t0 = time.monotonic()
            for i, (clip_path, (start_t, end_t, team)) in enumerate(
                zip(clip_paths, segments), 1
            ):
                clip_filename = Path(clip_path).name
                clip_s3_key = f"clips/{video.user_id}/{video_id}/{clip_filename}"
                await asyncio.to_thread(storage.upload_file, clip_path, clip_s3_key)

                session.add(
                    Clip(
                        video_id=video_id,
                        start_time=start_t,
                        end_time=end_t,
                        team=team,
                        s3_key=clip_s3_key,
                        duration=round(end_t - start_t, 3),
                    )
                )

                # Publicar progreso 75 → 90 durante los uploads
                clip_progress = 75 + int(15 * i / len(clip_paths))
                _publish(r, video_id, "processing", clip_progress)

            logger.info(
                "[video %d] stage 4/4: uploads done in %.1fs",
                video_id, time.monotonic() - t0,
            )

            # ── Complete ─────────────────────────────────────────────────
            video.status = VideoStatus.completed
            await session.commit()
            _publish(r, video_id, "completed", 100)
            logger.info(
                "[video %d] pipeline COMPLETE in %.1fs (%d clips)",
                video_id, time.monotonic() - pipeline_started, len(clip_paths),
            )

    except Exception as exc:
        logger.exception("[video %d] pipeline FAILED with unhandled error", video_id)
        try:
            async with async_session() as session:
                video = await session.get(Video, video_id)
                if video:
                    from app.models.video import VideoStatus as VS  # noqa: PLC0415
                    video.status = VS.error
                    video.error_message = str(exc)[:500]
                    await session.commit()
        except Exception:
            logger.exception("[video %d] ALSO failed to update error status", video_id)
        _publish(r, video_id, "error", 100, str(exc)[:500])
        raise

    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        r.close()
        await engine.dispose()


# ── Redis progress helpers ────────────────────────────────────────────────────

def _publish(
    r: redis.Redis,
    video_id: int,
    status: str,
    progress: int,
    error_message: str | None = None,
) -> None:
    payload = json.dumps(
        {"status": status, "progress": progress, "error_message": error_message}
    )
    channel = f"video:{video_id}"
    r.publish(channel, payload)
    r.setex(f"{channel}:progress", 86_400, payload)
