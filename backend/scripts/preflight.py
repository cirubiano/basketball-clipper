"""
Pre-flight check — corre este script antes de `docker compose up` para
detectar los problemas más habituales ANTES de levantar todo el stack.

    python backend/scripts/preflight.py

Sólo usa la stdlib, así que puede ejecutarse sin tener instaladas las deps
del proyecto (útil en Windows con PyCharm sin venv activado).

Un fallo aquí no garantiza que docker compose up vaya a fallar, pero
siempre es más rápido verlo desde el host que esperar 5 minutos a que
arranque el contenedor para descubrir que falta el .env.
"""
from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # basketball-clipper/
BACKEND = ROOT / "backend"

RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RESET = "\033[0m"

errors: list[str] = []
warnings: list[str] = []


def ok(msg: str) -> None:
    print(f"  {GREEN}OK{RESET}  {msg}")


def fail(msg: str) -> None:
    errors.append(msg)
    print(f"  {RED}FAIL{RESET} {msg}")


def warn(msg: str) -> None:
    warnings.append(msg)
    print(f"  {YELLOW}WARN{RESET} {msg}")


# ── 1. Archivos requeridos ───────────────────────────────────────────────────

print("\n[1/6] Archivos requeridos")
required = [
    ROOT / "docker-compose.yml",
    BACKEND / "Dockerfile",
    BACKEND / "requirements.txt",
    BACKEND / ".env",
    BACKEND / "alembic.ini",
    BACKEND / "alembic" / "env.py",
    BACKEND / "alembic" / "versions" / "0001_initial_schema.py",
    BACKEND / "app" / "main.py",
]
for f in required:
    if f.is_file():
        ok(str(f.relative_to(ROOT)))
    else:
        fail(f"Falta {f.relative_to(ROOT)}")


# ── 2. docker-compose.yml válido ─────────────────────────────────────────────

print("\n[2/6] docker-compose.yml")
compose = ROOT / "docker-compose.yml"
if compose.is_file():
    src = compose.read_text()
    if "alembic upgrade head" in src:
        ok("El servicio backend corre 'alembic upgrade head' al arrancar")
    else:
        fail("El servicio backend NO corre las migraciones — añade 'alembic upgrade head'")
    for svc in ("backend", "worker", "db", "redis"):
        if f"  {svc}:" in src:
            ok(f"Servicio '{svc}' declarado")
        else:
            fail(f"Servicio '{svc}' no encontrado en docker-compose.yml")


# ── 3. .env contiene las claves mínimas ─────────────────────────────────────

print("\n[3/6] backend/.env")
env_file = BACKEND / ".env"
if env_file.is_file():
    keys = {
        line.split("=", 1)[0].strip()
        for line in env_file.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#") and "=" in line
    }
    required_keys = {
        "SECRET_KEY",
        "DATABASE_URL",
        "REDIS_URL",
        "CELERY_BROKER_URL",
        "CELERY_RESULT_BACKEND",
    }
    missing = required_keys - keys
    if missing:
        fail(f"Faltan claves en .env: {sorted(missing)}")
    else:
        ok(f"Todas las claves requeridas presentes ({len(required_keys)})")

    for placeholder in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        for line in env_file.read_text().splitlines():
            if line.startswith(placeholder + "="):
                val = line.split("=", 1)[1].strip()
                if val.startswith("your-") or val == "":
                    warn(f"{placeholder} es un placeholder — no podrás usar la API real hasta rellenarlo")
                break


# ── 4. requirements.txt sano ────────────────────────────────────────────────

print("\n[4/6] backend/requirements.txt")
req_file = BACKEND / "requirements.txt"
if req_file.is_file():
    reqs = req_file.read_text()
    for pkg in ("fastapi", "uvicorn", "sqlalchemy", "alembic", "celery", "redis"):
        if pkg in reqs.lower():
            ok(f"'{pkg}' presente")
        else:
            fail(f"'{pkg}' ausente en requirements.txt")
    if "passlib" in reqs and "bcrypt==" not in reqs:
        warn("passlib está presente pero bcrypt no está pinneado — riesgo de incompatibilidad con bcrypt>=4.1")


# ── 5. Sintaxis Python del backend ──────────────────────────────────────────

print("\n[5/6] Sintaxis Python")
py_files = list((BACKEND / "app").rglob("*.py")) + list((BACKEND / "alembic").rglob("*.py"))
syntax_errors = 0
for f in py_files:
    try:
        ast.parse(f.read_text(), str(f))
    except SyntaxError as exc:
        fail(f"{f.relative_to(ROOT)}: {exc.msg} (línea {exc.lineno})")
        syntax_errors += 1
if syntax_errors == 0:
    ok(f"{len(py_files)} archivos Python compilan")


# ── 6. Puertos libres en el host ────────────────────────────────────────────

print("\n[6/6] Puertos libres en el host")
def port_in_use(port: int) -> bool:
    """Check sin socket() — netstat/ss son más fiables cross-platform."""
    try:
        if sys.platform == "win32":
            out = subprocess.check_output(
                ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
            )
            return f":{port} " in out and "LISTENING" in out
        else:
            out = subprocess.check_output(
                ["ss", "-tln"], text=True, stderr=subprocess.DEVNULL
            )
            return f":{port} " in out
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


for port in (8000, 5432, 6379):
    if port_in_use(port):
        warn(f"Puerto {port} en uso — docker compose fallará al bindear")
    else:
        ok(f"Puerto {port} libre")


# ── Resumen ──────────────────────────────────────────────────────────────────

print()
if errors:
    print(f"{RED}✗ {len(errors)} errores — arreglalos antes de 'docker compose up'{RESET}")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
elif warnings:
    print(f"{YELLOW}⚠ Todo ejecutable pero con {len(warnings)} avisos:{RESET}")
    for w in warnings:
        print(f"  - {w}")
    sys.exit(0)
else:
    print(f"{GREEN}✓ Todo en orden — listo para 'docker compose up'{RESET}")
    sys.exit(0)
