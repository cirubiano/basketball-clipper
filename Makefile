# ── basketball-clipper — verificación unificada ───────────────────────────────
#
# Uso:
#   make check          # ejecuta TODO (backend + web) — punto de entrada principal
#   make check-backend  # solo pytest (con coverage)
#   make check-web      # solo TypeScript + lint + vitest
#
# Requiere Docker Compose para el backend.
# El frontend corre localmente (Node.js debe estar instalado).
#
# Variables
DOCKER_BACKEND := docker compose run --rm backend

.PHONY: check check-backend check-web

# ── Punto de entrada principal ────────────────────────────────────────────────

check: check-backend check-web
	@echo ""
	@echo "✅  Todas las verificaciones han pasado."

# ── Backend ───────────────────────────────────────────────────────────────────

check-backend:
	@echo "══════════════════════════════════════════"
	@echo "  Backend — pytest + coverage"
	@echo "══════════════════════════════════════════"
	$(DOCKER_BACKEND) python -m pytest tests/ -q --tb=short

# ── Web / Shared ──────────────────────────────────────────────────────────────

check-web:
	@echo "══════════════════════════════════════════"
	@echo "  Shared — TypeScript"
	@echo "══════════════════════════════════════════"
	cd shared && npx tsc --project tsconfig.json --noEmit

	@echo "══════════════════════════════════════════"
	@echo "  Web — TypeScript"
	@echo "══════════════════════════════════════════"
	cd web && npm run type-check

	@echo "══════════════════════════════════════════"
	@echo "  Web — ESLint"
	@echo "══════════════════════════════════════════"
	cd web && npm run lint

	@echo "══════════════════════════════════════════"
	@echo "  Web — Vitest"
	@echo "══════════════════════════════════════════"
	cd web && npm test

# ── Build (mirrors CI — not in check-web due to build time) ──────────────────

.PHONY: build-web

build-web:
	@echo "══════════════════════════════════════════"
	@echo "  Web — Next.js build"
	@echo "══════════════════════════════════════════"
	cd web && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build
