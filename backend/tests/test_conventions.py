"""
Tests de convenciones estructurales del monorepo.

Automatizan los checks que antes se hacían manualmente siguiendo CLAUDE.md.
Si falla alguno, indica una regresión estructural (ruta mal montada, import
incorrecto, convención de shared/api rota).

    pytest tests/test_conventions.py -v
    # o desde la raíz:
    make check-backend
"""
from __future__ import annotations

import re
from pathlib import Path

# Raíz del monorepo (backend/tests/ → ../../)
REPO_ROOT = Path(__file__).parent.parent.parent
SHARED_API = REPO_ROOT / "shared" / "api"
WEB_APP = REPO_ROOT / "web" / "app"


# ── 1. Rutas de la API ────────────────────────────────────────────────────────

def test_all_api_routes_registered():
    """
    Verifica que todas las rutas de la tabla de API estén registradas en la
    app FastAPI con el prefix correcto.

    Protege contra el error de montar un router con el prefix equivocado
    (p.ej. seasons.router con prefix /seasons en lugar de /clubs).
    Si añades un endpoint nuevo, añade su ruta completa aquí.
    """
    from app.main import app

    registered = {route.path for route in app.routes if hasattr(route, "path")}

    expected = {
        # ── Health ────────────────────────────────────────────────────────────
        "/health",

        # ── Auth ──────────────────────────────────────────────────────────────
        "/auth/register",
        "/auth/login",
        "/auth/switch-profile",
        "/auth/clear-profile",
        "/auth/me",
        "/auth/me/password",

        # ── Profiles ──────────────────────────────────────────────────────────
        "/profiles/{profile_id}",

        # ── Clubs ─────────────────────────────────────────────────────────────
        "/clubs/mine",
        "/clubs/{club_id}",
        "/clubs/{club_id}/members",
        "/clubs/{club_id}/profiles",

        # ── Seasons ───────────────────────────────────────────────────────────
        "/clubs/{club_id}/seasons",
        "/clubs/{club_id}/seasons/{season_id}/status",

        # ── Teams ─────────────────────────────────────────────────────────────
        "/clubs/{club_id}/teams",
        "/clubs/{club_id}/teams/{team_id}",

        # ── Players ───────────────────────────────────────────────────────────
        "/clubs/{club_id}/players",
        "/clubs/{club_id}/players/photo-upload-url",
        "/clubs/{club_id}/players/import-csv",
        "/clubs/{club_id}/players/{player_id}",
        "/clubs/{club_id}/teams/{team_id}/roster",
        "/clubs/{club_id}/teams/{team_id}/roster/{entry_id}",

        # ── Positions ─────────────────────────────────────────────────────────
        "/clubs/{club_id}/positions",
        "/clubs/{club_id}/positions/{pos_id}",

        # ── Videos ────────────────────────────────────────────────────────────
        "/videos/",
        "/videos/init-upload",
        "/videos/{video_id}/upload-status",
        "/videos/{video_id}/complete-upload",
        "/videos/{video_id}/abort-upload",
        "/videos/{video_id}/retry",
        "/videos/{video_id}",
        "/videos/{video_id}/status",
        "/videos/{video_id}/clips",

        # ── Clips ─────────────────────────────────────────────────────────────
        "/clips/",
        "/clips/{clip_id}",

        # ── WebSocket ─────────────────────────────────────────────────────────
        "/ws/{video_id}",

        # ── Drills ────────────────────────────────────────────────────────────
        "/drills/tags",
        "/drills/tags/{tag_id}",
        "/drills",
        "/drills/{drill_id}",
        "/drills/{drill_id}/clone",
        "/drills/{drill_id}/variants",
        "/drills/{drill_id}/favorite",

        # ── Catalog ───────────────────────────────────────────────────────────
        "/clubs/{club_id}/catalog/tags",
        "/clubs/{club_id}/catalog/tags/{tag_id}",
        "/clubs/{club_id}/catalog",
        "/clubs/{club_id}/catalog/{entry_id}",
        "/clubs/{club_id}/catalog/{entry_id}/update-copy",
        "/clubs/{club_id}/catalog/{entry_id}/copy-to-library",
        "/clubs/{club_id}/catalog/{entry_id}/tags",

        # ── Playbook ──────────────────────────────────────────────────────────
        "/clubs/{club_id}/teams/{team_id}/playbook",
        "/clubs/{club_id}/teams/{team_id}/playbook/{entry_id}",

        # ── Matches ───────────────────────────────────────────────────────────
        "/clubs/{club_id}/teams/{team_id}/matches",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/start",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/finish",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/cancel",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/permanent",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/players",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/players/{player_id}",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/videos",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/videos/{video_id}",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/stats",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/set-starters",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/set-rival-starters",

        # ── Trainings ─────────────────────────────────────────────────────────
        "/clubs/{club_id}/teams/{team_id}/trainings",
        "/clubs/{club_id}/teams/{team_id}/trainings/bulk",
        "/clubs/{club_id}/teams/{team_id}/trainings/{training_id}",
        "/clubs/{club_id}/teams/{team_id}/trainings/{training_id}/attendance",
        "/clubs/{club_id}/teams/{team_id}/trainings/{training_id}/drills",
        "/clubs/{club_id}/teams/{team_id}/trainings/{training_id}/drills/{td_id}",
        "/clubs/{club_id}/teams/{team_id}/trainings/{training_id}/drills/{td_id}/groups",

        # ── Competitions ──────────────────────────────────────────────────────
        "/clubs/{club_id}/teams/{team_id}/competitions",
        "/clubs/{club_id}/teams/{team_id}/competitions/{comp_id}",
        "/clubs/{club_id}/teams/{team_id}/competitions/{comp_id}/set-default",

        # ── Opponents ─────────────────────────────────────────────────────────
        "/clubs/{club_id}/opponents",
        "/clubs/{club_id}/opponents/{opp_id}",
        "/clubs/{club_id}/opponents/{opp_id}/players",
        "/clubs/{club_id}/opponents/{opp_id}/players/bulk",
        "/clubs/{club_id}/opponents/{opp_id}/players/{pid}",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats",
        "/clubs/{club_id}/teams/{team_id}/matches/{match_id}/opponent-stats/{stat_id}",
    }

    missing = expected - registered
    assert not missing, (
        "Las siguientes rutas no están registradas en la app FastAPI.\n"
        "Causa probable: prefix incorrecto en main.py o endpoint eliminado.\n"
        + "\n".join(f"  ✗ {r}" for r in sorted(missing))
    )


# ── 2. Convenciones de shared/api/ ────────────────────────────────────────────

def _lines_matching(directory: Path, pattern: str, skip_files: list[str] | None = None) -> list[str]:
    """Devuelve 'archivo:línea: contenido' para cada coincidencia del patrón."""
    skip = set(skip_files or [])
    hits: list[str] = []
    for ts_file in sorted(directory.glob("*.ts")):
        if ts_file.name in skip:
            continue
        for i, line in enumerate(ts_file.read_text(encoding="utf-8").splitlines(), 1):
            if pattern in line:
                hits.append(f"{ts_file.name}:{i}: {line.strip()}")
    return hits


def test_no_apiClient_in_shared_api():
    """
    'apiClient' no existe en shared/api/client.ts. Su uso indica un import
    de una versión anterior del cliente. Usar apiRequest en su lugar.
    """
    hits = _lines_matching(SHARED_API, "apiClient")
    assert not hits, (
        "Encontrado 'apiClient' en shared/api/ — usar apiRequest:\n"
        + "\n".join(f"  {h}" for h in hits)
    )


def test_no_plain_body_object_in_shared_api():
    """
    Los cuerpos de POST/PATCH deben ser JSON.stringify(data).
    Un objeto plano como body hace que FastAPI reciba un string vacío.
    """
    hits = _lines_matching(SHARED_API, "body: {")
    assert not hits, (
        "Encontrado 'body: {' en shared/api/ — usar JSON.stringify(...):\n"
        + "\n".join(f"  {h}" for h in hits)
    )


def test_no_body_data_shorthand_in_shared_api():
    """Misma causa que body: {} pero con el shorthand body: data."""
    hits = _lines_matching(SHARED_API, "body: data")
    assert not hits, (
        "Encontrado 'body: data' en shared/api/ — usar body: JSON.stringify(data):\n"
        + "\n".join(f"  {h}" for h in hits)
    )


# ── 3. Imports sub-paths en web/app/ ─────────────────────────────────────────

def test_no_root_shared_imports_in_web():
    """
    Las páginas web deben importar desde @basketball-clipper/shared/api
    o @basketball-clipper/shared/types, nunca desde el root del paquete.

    Un import desde root puede fallar si cambia el campo exports de
    shared/package.json, y ya ha causado errores en producción (sesión 16).
    """
    violations: list[str] = []
    # Patrón: from '@basketball-clipper/shared'  sin /api ni /types a continuación
    pattern = re.compile(r"""from\s+['"]@basketball-clipper/shared['"]""")

    for tsx_file in sorted(WEB_APP.rglob("*.tsx")):
        for i, line in enumerate(tsx_file.read_text(encoding="utf-8").splitlines(), 1):
            if pattern.search(line):
                rel = tsx_file.relative_to(REPO_ROOT)
                violations.append(f"{rel}:{i}: {line.strip()}")

    assert not violations, (
        "Imports desde root de @basketball-clipper/shared — usar /api o /types:\n"
        + "\n".join(f"  {v}" for v in violations)
    )
