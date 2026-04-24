# Basketball Clipper — Backend

Python 3.11 + FastAPI backend for the Basketball Clipper platform.

## Stack

- **FastAPI** — REST API + WebSockets
- **SQLAlchemy 2.0** (async) + **Alembic** — ORM and migrations
- **PostgreSQL 16** — database
- **Celery + Redis** — background job queue for video processing
- **YOLOv8 + OpenCV** — possession detection
- **FFmpeg** — video clip cutting
- **Claude Vision API** — basketball validation
- **S3 (boto3)** — video and clip storage

## Setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # fill in your values
```

## Run (development)

```bash
uvicorn app.main:app --reload
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

## Run with Docker Compose (full stack)

From the repo root:

```bash
docker-compose up
```

## Database migrations

```bash
# Create a new migration
alembic revision --autogenerate -m "describe the change"

# Apply migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

## Tests

```bash
pytest
```

## Project structure

```
app/
├── main.py          # FastAPI app, router registration
├── core/
│   ├── config.py    # All env vars via Pydantic Settings
│   ├── database.py  # Async SQLAlchemy engine + session
│   └── security.py  # JWT creation and verification
├── routers/         # Thin HTTP handlers — no business logic here
├── services/        # All business logic lives here
├── models/          # SQLAlchemy ORM models
└── schemas/         # Pydantic request/response schemas
```
