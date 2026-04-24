"""
Smoke tests que verifican que el backend arranca sin errores.

    docker compose run --rm backend pytest tests/test_startup.py -v
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest


# ── 1. Settings ──────────────────────────────────────────────────────────────

def test_settings_load_without_errors():
    from app.core.config import settings

    assert settings.database_url.startswith("postgresql")
    assert settings.redis_url.startswith("redis://")
    assert settings.celery_broker_url.startswith("redis://")
    assert isinstance(settings.allowed_origins, str)
    assert isinstance(settings.cors_origins, list)


def test_cors_origins_parses_comma_separated_string(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://a.com,http://b.com")
    import app.core.config as cfg
    importlib.reload(cfg)
    assert cfg.settings.cors_origins == ["http://a.com", "http://b.com"]


# ── 2. Imports ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "module_path",
    [
        "app.main",
        "app.core.config",
        "app.core.database",
        "app.core.security",
        "app.models.user",
        "app.models.video",
        "app.models.clip",
        "app.models.exercise",
        "app.routers.auth",
        "app.routers.video",
        "app.routers.clips",
        "app.routers.ws",
        "app.routers.exercises",
        "app.schemas.auth",
        "app.schemas.video",
        "app.schemas.clip",
        "app.services.queue",
        "app.services.storage",
        "app.services.validator",
        "app.services.detector",
        "app.services.cutter",
    ],
)
def test_module_imports_cleanly(module_path: str):
    importlib.import_module(module_path)


# ── 3. FastAPI app ───────────────────────────────────────────────────────────

def test_fastapi_app_has_expected_routes():
    from app.main import app

    paths = {route.path for route in app.routes}

    expected = {
        "/health",
        "/auth/register",
        "/auth/login",
        "/auth/me",
        # Nuevo flujo multipart upload
        "/videos/init-upload",
        "/videos/{video_id}/upload-status",
        "/videos/{video_id}/complete-upload",
        "/videos/{video_id}/abort-upload",
        "/videos/{video_id}/status",
        "/clips/",
        "/clips/{clip_id}",
        "/ws/{video_id}",
    }
    missing = expected - paths
    assert not missing, f"Rutas faltantes: {missing}"


def test_health_endpoint_responds_ok():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ── 4. Modelos ───────────────────────────────────────────────────────────────

def test_all_models_are_mapped_on_base():
    from app.core.database import Base
    import app.models.clip  # noqa: F401
    import app.models.exercise  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.video  # noqa: F401

    tables = set(Base.metadata.tables.keys())
    expected = {"users", "videos", "clips", "exercises"}
    assert expected.issubset(tables), f"Faltan: {expected - tables}"


def test_video_status_enum_values():
    from app.models.video import VideoStatus

    assert {s.value for s in VideoStatus} == {
        "uploading",
        "pending",
        "validating",
        "processing",
        "completed",
        "invalid",
        "error",
    }


def test_video_model_has_multipart_columns():
    from app.models.video import Video

    columns = {c.name for c in Video.__table__.columns}
    assert "upload_id" in columns
    assert "upload_parts" in columns


# ── 5. Alembic ───────────────────────────────────────────────────────────────

def test_alembic_env_imports_without_errors():
    alembic_env = Path(__file__).parent.parent / "alembic" / "env.py"
    assert alembic_env.is_file()
    compile(alembic_env.read_text(), str(alembic_env), "exec")


def test_initial_migration_creates_expected_tables():
    migration = (
        Path(__file__).parent.parent
        / "alembic"
        / "versions"
        / "0001_initial_schema.py"
    )
    assert migration.is_file()
    src = migration.read_text()
    for table in ("users", "videos", "clips"):
        assert f'"{table}"' in src, f"Migración 0001 no crea la tabla {table!r}"


def test_multipart_migration_exists():
    migration = (
        Path(__file__).parent.parent
        / "alembic"
        / "versions"
        / "0002_multipart_upload.py"
    )
    assert migration.is_file(), "Migración 0002 debe existir"
    src = migration.read_text()
    assert "upload_id" in src
    assert "upload_parts" in src
    assert "uploading" in src


# ── 6. Security ──────────────────────────────────────────────────────────────

def test_password_hash_and_verify_roundtrip():
    """Detecta la incompatibilidad passlib 1.7.4 + bcrypt 4.x."""
    from app.core.security import hash_password, verify_password

    hashed = hash_password("supersecret123")
    assert hashed != "supersecret123"
    assert verify_password("supersecret123", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_jwt_encode_and_decode_roundtrip():
    from app.core.security import create_access_token, decode_access_token

    token = create_access_token(subject=42)
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert "exp" in payload


# ── 7. Celery ────────────────────────────────────────────────────────────────

def test_celery_app_registers_process_video_task():
    from app.services.queue import celery_app, process_video

    assert celery_app.main == "basketball_clipper"
    assert "process_video" in celery_app.tasks
    assert process_video.name == "process_video"


# ── 8. Storage multipart API ─────────────────────────────────────────────────

def test_storage_module_exposes_multipart_helpers():
    """El nuevo flujo depende de estos símbolos."""
    from app.services import storage

    assert callable(storage.create_multipart_upload)
    assert callable(storage.generate_part_url)
    assert callable(storage.complete_multipart_upload)
    assert callable(storage.abort_multipart_upload)
    assert callable(storage.list_parts)
