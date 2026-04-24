# Basketball Clipper — Docs

Technical documentation and architecture decisions for the Basketball Clipper platform.

## Contents

- [architecture.md](./architecture.md) — Architecture Decision Records (ADRs)

## Video processing pipeline

```
1. POST /videos/upload
   → file saved to S3
   → Video record created (status=pending)
   → Celery task enqueued

2. Worker: validator.py
   → Claude Vision API samples frames
   → Not basketball? → status=invalid, notify user
   → Basketball? → continue

3. Worker: detector.py
   → YOLOv8 detects players + ball frame by frame
   → OpenCV identifies jersey colors (two teams)
   → Generates possession segments [(start, end, team), ...]

4. Worker: cutter.py
   → FFmpeg cuts one clip per segment
   → Clips uploaded to S3
   → Clip records created in DB

5. WebSocket /ws/{video_id}
   → Frontend receives real-time progress
   → Final status=completed triggers clip library update
```
