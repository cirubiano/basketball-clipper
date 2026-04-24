"""
WebSocket endpoint for real-time video processing progress.

The Celery worker publishes JSON progress payloads to the Redis Pub/Sub
channel ``video:{video_id}``. This handler subscribes to that channel and
forwards every message to the connected WebSocket client.

Message format (same as the REST status response):
    {"status": "processing", "progress": 60, "error_message": null}

The connection is closed automatically when:
  - The client disconnects.
  - The pipeline publishes a terminal status ("completed", "invalid", "error").

Auth: the video_id is a non-guessable integer so we intentionally skip token
auth here to keep the frontend integration simple in Phase 1. Add query-param
token validation before Phase 2 if needed.
"""
import json

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings

router = APIRouter()

_TERMINAL_STATUSES = {"completed", "invalid", "error"}


@router.websocket("/ws/{video_id}")
async def video_progress_ws(websocket: WebSocket, video_id: int) -> None:
    await websocket.accept()

    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"video:{video_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            data: str = message["data"]
            await websocket.send_text(data)

            # Close the connection once a terminal state is reached so the
            # client doesn't need to implement its own timeout
            try:
                payload = json.loads(data)
                if payload.get("status") in _TERMINAL_STATUSES:
                    break
            except (json.JSONDecodeError, AttributeError):
                pass

    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"video:{video_id}")
        await r.aclose()
