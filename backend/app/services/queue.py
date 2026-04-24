"""
Celery task that orchestrates the full video processing pipeline.

Execution model
---------------
Celery workers are synchronous. All heavy I/O (S3, DB) runs inside
``asyncio.run(_run_pipeline(...))`` which creates a fresh event loop per task
invocation. A *new* SQLAlchemy async engine is created inside the coroutine
rather than reusing the global one so there are no event-loop conflicts with
the asyncpg connection pool.

Progress updates
----------------
Each pipeline stage publishes a JSON message to the Redis Pub/Sub channel
``video:{video_id}`` so the FastAPI WebSocket handler can forward it to the
browser in real time. The same payload is also stored as a Redis string
(``video:{video_id}:progress``) so the REST status endpoint can serve it
to clients that connect after the pipeline has already progressed.
"""
import asyncio
import json
import logging
import os
import shutil
import tempfile
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
    """Synchronous Celery entry point — delegates to the async pipeline."""
    asyncio.run(_run_pipeline(video_id))


# ── Async pipeline ────────────────────────────────────────────────────────────

async def _run_pipeline(video_id: int) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models.clip import Clip
    from app.models.video import Video, VideoStatus
    from app.services import cutter, detector, storage, validator

    # Create a fresh engine for this task invocation to avoid event-loop
    # conflicts with the global asyncpg connection pool used by FastAPI.
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    tmp_dir: str | None = None

    try:
        async with async_session() as session:
            video: Video | None = await session.get(Video, video_id)
            if video is None:
                logger.error("process_video: video %d not found in DB", video_id)
                return

            tmp_dir = tempfile.mkdtemp(prefix=f"bc_video_{video_id}_")
            video_ext = Path(video.filename).suffix or ".mp4"
            video_local = os.path.join(tmp_dir, f"source{video_ext}")

            # ── Stage 1: Download from S3 ─────────────────────────────────
            _publish(r, video_id, "validating", 5)
            video.status = VideoStatus.validating
            await session.commit()

            await asyncio.to_thread(storage.download_file, video.s3_key, video_local)
            _publish(r, video_id, "validating", 15)

            # ── Stage 2: Validate with Claude Vision ──────────────────────
            is_basketball: bool = await asyncio.to_thread(
                validator.validate_basketball_video, video_local
            )
            if not is_basketball:
                msg = "The uploaded video does not appear to be a basketball game."
                video.status = VideoStatus.invalid
                video.error_message = msg
                await session.commit()
                _publish(r, video_id, "invalid", 100, msg)
                logger.info("process_video: video %d rejected as non-basketball", video_id)
                return

            # ── Stage 3: Detect possession segments ───────────────────────
            _publish(r, video_id, "processing", 25)
            video.status = VideoStatus.processing
            await session.commit()

            segments: list[tuple[float, float, str]] = await asyncio.to_thread(
                detector.detect_possessions, video_local
            )
            _publish(r, video_id, "processing", 55)

            if not segments:
                msg = "Could not detect any possession segments in the video."
                video.status = VideoStatus.error
                video.error_message = msg
                await session.commit()
                _publish(r, video_id, "error", 100, msg)
                logger.warning("process_video: no segments detected for video %d", video_id)
                return

            # ── Stage 4: Cut clips ────────────────────────────────────────
            clips_dir = os.path.join(tmp_dir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            clip_paths: list[str] = await asyncio.to_thread(
                cutter.cut_clips, video_local, segments, clips_dir
            )
            _publish(r, video_id, "processing", 75)

            # ── Stage 5: Upload clips + create DB records ─────────────────
            for clip_path, (start_t, end_t, team) in zip(clip_paths, segments):
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

            _publish(r, video_id, "processing", 90)

            # ── Stage 6: Mark complete ────────────────────────────────────
            video.status = VideoStatus.completed
            await session.commit()
            _publish(r, video_id, "completed", 100)
            logger.info(
                "process_video: video %d completed — %d clips", video_id, len(clip_paths)
            )

    except Exception as exc:
        logger.exception("process_video: unhandled error for video %d", video_id)
        # Best-effort: mark the video as errored so the user gets feedback
        try:
            async with async_session() as session:
                video = await session.get(Video, video_id)
                if video:
                    from app.models.video import VideoStatus as VS  # noqa: PLC0415
                    video.status = VS.error
                    video.error_message = str(exc)[:500]
                    await session.commit()
        except Exception:
            logger.exception("process_video: also failed to update error status for %d", video_id)
        _publish(r, video_id, "error", 100, str(exc)[:500])
        raise  # propagate so Celery marks the task as FAILURE

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
    # Cache as a plain string so the REST status endpoint can serve it without
    # subscribing to pub-sub. Expires after 24 h.
    r.setex(f"{channel}:progress", 86_400, payload)
