"""
Basketball validator — uses the Claude Vision API to confirm that an uploaded
video actually shows a basketball game before running the expensive detection
pipeline.

Designed to be called synchronously from a Celery worker.
"""
import base64
import logging

import anthropic
import cv2

from app.core.config import settings

logger = logging.getLogger(__name__)

# Number of frames sampled from the video for the vision check
_SAMPLE_COUNT = 5

# Use Haiku for classification: cheap, fast, and Claude vision is more than
# capable enough for this binary yes/no task
_MODEL = "claude-haiku-4-5-20251001"

_PROMPT = (
    "I am showing you a sample of frames extracted from a video. "
    "Does this video show a basketball game being played? "
    "Answer with exactly one word: 'yes' or 'no'."
)


def validate_basketball_video(video_path: str) -> bool:
    """
    Samples *_SAMPLE_COUNT* evenly-spaced frames from *video_path* and asks
    Claude whether the footage is a basketball game.

    Returns True if basketball, False otherwise.
    """
    frames_b64 = _extract_frames_b64(video_path, _SAMPLE_COUNT)
    if not frames_b64:
        logger.warning("validate: could not extract any frames from %s", video_path)
        return False

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    content: list = []
    for b64 in frames_b64:
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64,
                },
            }
        )
    content.append({"type": "text", "text": _PROMPT})

    response = client.messages.create(
        model=_MODEL,
        max_tokens=5,
        messages=[{"role": "user", "content": content}],
    )

    answer = response.content[0].text.strip().lower()
    logger.info("validate: Claude answered '%s' for %s", answer, video_path)
    return answer.startswith("yes")


# ── Frame extraction helpers ──────────────────────────────────────────────────

def _extract_frames_b64(video_path: str, count: int) -> list[str]:
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if total_frames <= 0:
        cap.release()
        return []

    count = min(count, total_frames)

    # Sample positions spread evenly across the video, skipping the first and
    # last 5% to avoid black frames at fade-in / fade-out.
    margin = max(1, int(total_frames * 0.05))
    usable = total_frames - 2 * margin

    if count == 1:
        positions = [total_frames // 2]
    else:
        positions = [margin + int(usable * i / (count - 1)) for i in range(count)]

    frames_b64: list[str] = []
    for pos in positions:
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ret, frame = cap.read()
        if not ret:
            continue
        frame = _resize_frame(frame, max_side=768)
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frames_b64.append(base64.standard_b64encode(buf).decode())

    cap.release()
    return frames_b64


def _resize_frame(frame, max_side: int):
    h, w = frame.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return frame
    scale = max_side / longest
    return cv2.resize(frame, (int(w * scale), int(h * scale)))
