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
        # Core
        "app.main",
        "app.core.config",
        "app.core.database",
        "app.core.security",
        # Models — todos deben importar sin error
        "app.models.user",
        "app.models.video",
        "app.models.clip",
        "app.models.exercise",
        "app.models.club",
        "app.models.season",
        "app.models.team",
        "app.models.profile",
        "app.models.club_member",
        "app.models.player",
        "app.models.club_position",
        "app.models.drill",
        "app.models.club_tag",
        "app.models.catalog",
        "app.models.playbook",
        "app.models.match",
        "app.models.training",
        "app.models.competition",
        "app.models.opponent",
        # Routers — todos deben importar sin error
        "app.routers.auth",
        "app.routers.video",
        "app.routers.clips",
        "app.routers.ws",
        "app.routers.exercises",
        "app.routers.clubs",
        "app.routers.seasons",
        "app.routers.teams",
        "app.routers.players",
        "app.routers.positions",
        "app.routers.profiles",
        "app.routers.drills",
        "app.routers.catalog",
        "app.routers.playbook",
        "app.routers.matches",
        "app.routers.trainings",
        "app.routers.competitions",
        "app.routers.opponents",
        # Schemas
        "app.schemas.auth",
        "app.schemas.video",
        "app.schemas.clip",
        "app.schemas.club",
        "app.schemas.player",
        "app.schemas.drill",
        "app.schemas.catalog",
        "app.schemas.playbook",
        "app.schemas.match",
        "app.schemas.training",
        "app.schemas.competition",
        "app.schemas.opponent",
        # Services
        "app.services.queue",
        "app.services.storage",
        "app.services.detector",
        "app.services.cutter",
        "app.services.catalog",
    ],
)
def test_module_imports_cleanly(module_path: str):
    importlib.import_module(module_path)


# ── 3. FastAPI app ───────────────────────────────────────────────────────────

def test_fastapi_app_core_routes_registered():
    """
    Smoke check: las rutas esenciales de arranque estan registradas.
    La cobertura completa de rutas esta en test_conventions.py::test_all_api_routes_registered.
    """
    from app.main import app

    paths = {route.path for route in app.routes if hasattr(route, "path")}

    assert "/health" in paths
    assert "/auth/login" in paths
    assert "/auth/me" in paths
    assert "/videos/init-upload" in paths
    assert "/ws/{video_id}" in paths


def test_health_endpoint_responds_ok():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ── 4. Modelos ───────────────────────────────────────────────────────────────

def test_all_models_are_mapped_on_base():
    """Todos los modelos SQLAlchemy estan registrados en Base.metadata."""
    from app.core.database import Base

    # Importar todos los modelos para que se registren en Base.metadata
    import app.models.clip         # noqa: F401
    import app.models.exercise     # noqa: F401
    import app.models.user         # noqa: F401
    import app.models.video        # noqa: F401
    import app.models.club         # noqa: F401
    import app.models.season       # noqa: F401
    import app.models.team         # noqa: F401
    import app.models.profile      # noqa: F401
    import app.models.club_member  # noqa: F401
    import app.models.player       # noqa: F401
    import app.models.club_position  # noqa: F401
    import app.models.drill        # noqa: F401
    import app.models.club_tag     # noqa: F401
    import app.models.catalog      # noqa: F401
    import app.models.playbook     # noqa: F401
    import app.models.match        # noqa: F401
    import app.models.training     # noqa: F401
    import app.models.competition  # noqa: F401
    import app.models.opponent     # noqa: F401

    tables = set(Base.metadata.tables.keys())

    expected = {
        "users", "videos", "clips", "exercises",
        "clubs", "club_members", "seasons", "teams", "profiles",
        "players", "roster_entries", "club_positions",
        "tags", "drills",
        "club_tags", "club_catalog_entries",
        "team_playbook_entries",
        "matches", "match_players", "match_stats", "match_videos",
        "trainings", "training_drills", "training_attendances", "training_drill_groups",
        "competitions",
        "opponent_teams", "opponent_players", "opponent_match_stats",
    }
    missing = expected - tables
    assert not missing, (
        "Tablas no encontradas en Base.metadata — falta importar el modelo?\n"
        + "\n".join(f"  x {t}" for t in sorted(missing))
    )


def test_video_status_enum_values():
    from app.models.video import VideoStatus

    assert {s.value for s in VideoStatus} == {
        "uploading",
        "pending",
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
        assert f'"{table}"' in src, f"Migracion 0001 no crea la tabla {table!r}"


def test_multipart_migration_exists():
    migration = (
        Path(__file__).parent.parent
        / "alembic"
        / "versions"
        / "0002_multipart_upload.py"
    )
    assert migration.is_file(), "Migracion 0002 debe existir"
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
    """El nuevo flujo depende de estos simbolos."""
    from app.services import storage

    assert callable(storage.create_multipart_upload)
    assert callable(storage.generate_part_url)
    assert callable(storage.complete_multipart_upload)
    assert callable(storage.abort_multipart_upload)
    assert callable(storage.list_parts)
