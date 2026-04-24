"""
Smoke tests que verifican que el backend arranca sin errores.

Estos tests se diseñan para ejecutarse dentro del contenedor backend,
donde todas las dependencias del `requirements.txt` están instaladas.
Sirven como red de seguridad antes de `docker compose up`:

    docker compose run --rm backend pytest tests/test_startup.py -v

Si todos pasan, el backend debería arrancar limpio. Si alguno falla,
el mensaje indica qué arreglar antes de volver a levantar el stack.

Cubren:
  - Carga de Pydantic Settings desde entorno/.env
  - Import de todos los módulos de `app/`
  - Creación de la app FastAPI (routers, middleware)
  - Endpoint /health vía TestClient (asgi)
  - Coherencia modelos SQLAlchemy ↔ migración inicial de Alembic
  - Helpers de security (hash password, JWT)
  - Descubrimiento de la tarea Celery
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest


# ── 1. Settings ──────────────────────────────────────────────────────────────

def test_settings_load_without_errors():
    """Pydantic Settings no debe explotar aunque falten variables opcionales."""
    from app.core.config import settings

    assert settings.database_url.startswith("postgresql")
    assert settings.redis_url.startswith("redis://")
    assert settings.celery_broker_url.startswith("redis://")
    # allowed_origins se almacena como str; cors_origins lo expone como list
    assert isinstance(settings.allowed_origins, str)
    assert isinstance(settings.cors_origins, list)
    assert all(isinstance(o, str) for o in settings.cors_origins)


def test_cors_origins_parses_comma_separated_string(monkeypatch):
    """La propiedad cors_origins debe aceptar 'a,b,c' igual que un JSON array."""
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://a.com,http://b.com")
    import app.core.config as cfg
    importlib.reload(cfg)
    assert cfg.settings.cors_origins == ["http://a.com", "http://b.com"]


def test_cors_origins_parses_json_array(monkeypatch):
    """La propiedad cors_origins debe aceptar '["a","b"]'."""
    monkeypatch.setenv("ALLOWED_ORIGINS", '["http://x.com","http://y.com"]')
    import app.core.config as cfg
    importlib.reload(cfg)
    assert cfg.settings.cors_origins == ["http://x.com", "http://y.com"]


# ── 2. Imports de la aplicación ──────────────────────────────────────────────

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
    """Cada módulo del backend debe importar sin lanzar excepciones."""
    importlib.import_module(module_path)


# ── 3. FastAPI app ───────────────────────────────────────────────────────────

def test_fastapi_app_has_expected_routes():
    """Todos los endpoints del contrato deben estar registrados."""
    from app.main import app

    paths = {route.path for route in app.routes}

    expected = {
        "/health",
        "/auth/register",
        "/auth/login",
        "/auth/me",
        "/videos/upload",
        "/videos/{video_id}/status",
        "/clips/",
        "/clips/{clip_id}",
        "/ws/{video_id}",
    }
    missing = expected - paths
    assert not missing, f"Rutas faltantes: {missing}"


def test_fastapi_app_cors_middleware_configured():
    from app.main import app

    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" in middleware_classes


def test_health_endpoint_responds_ok():
    """Smoke end-to-end vía TestClient (sin red externa)."""
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ── 4. SQLAlchemy models ─────────────────────────────────────────────────────

def test_all_models_are_mapped_on_base():
    """Todos los modelos deben registrarse contra el mismo Base."""
    from app.core.database import Base
    import app.models.clip  # noqa: F401
    import app.models.exercise  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.video  # noqa: F401

    tables = set(Base.metadata.tables.keys())
    expected = {"users", "videos", "clips", "exercises"}
    assert expected.issubset(tables), f"Faltan: {expected - tables}"


def test_video_status_enum_values():
    """Los valores del enum deben coincidir con los de la migración Alembic."""
    from app.models.video import VideoStatus

    assert {s.value for s in VideoStatus} == {
        "pending",
        "validating",
        "processing",
        "completed",
        "invalid",
        "error",
    }


# ── 5. Alembic ───────────────────────────────────────────────────────────────

def test_alembic_env_imports_without_errors():
    """env.py debe poder ejecutar sus imports top-level."""
    alembic_env = Path(__file__).parent.parent / "alembic" / "env.py"
    assert alembic_env.is_file(), "backend/alembic/env.py no encontrado"
    compile(alembic_env.read_text(), str(alembic_env), "exec")


def test_initial_migration_creates_expected_tables():
    """La migración 0001 debe crear todas las tablas que los modelos esperan."""
    migration = (
        Path(__file__).parent.parent
        / "alembic"
        / "versions"
        / "0001_initial_schema.py"
    )
    assert migration.is_file(), "Migración inicial 0001_initial_schema.py no encontrada"

    src = migration.read_text()
    for table in ("users", "videos", "clips"):
        assert f'"{table}"' in src, f"Migración 0001 no crea la tabla {table!r}"


# ── 6. Security helpers ──────────────────────────────────────────────────────

def test_password_hash_and_verify_roundtrip():
    """Detecta la incompatibilidad conocida passlib 1.7.4 + bcrypt 4.1+."""
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
    """El worker arranca con `celery -A app.services.queue worker`, así que
    esta referencia debe existir y la tarea process_video estar registrada."""
    from app.services.queue import celery_app, process_video

    assert celery_app.main == "basketball_clipper"
    assert "process_video" in celery_app.tasks
    assert process_video.name == "process_video"
