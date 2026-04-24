# Architecture Decision Records

## ADR-001 — Monorepo structure

**Decision**: Single Git repository for backend, web, mobile, shared types, and infrastructure.

**Reason**: Claude Code (and developers) need cross-stack context to make
coordinated changes. A monorepo lets you see the API contract and its consumers
in the same session, preventing drift between layers.

---

## ADR-002 — PostgreSQL now, Aurora Serverless later

**Decision**: Use PostgreSQL 16 (Docker locally, RDS in production) for phases 1–4.
Migrate to Aurora Serverless v2 at phase 5+.

**Reason**: Aurora Serverless v2 is 100% PostgreSQL-compatible. The only
change at migration time is the `DATABASE_URL` environment variable. Using
plain PostgreSQL in early phases avoids Aurora's higher cost and complexity
until traffic justifies it.

---

## ADR-003 — Celery + Redis for video processing

**Decision**: Use Celery with Redis as broker for the video processing pipeline.
Heavy GPU work (YOLOv8) runs on dedicated EC2 g4dn workers, not on the API
container.

**Reason**: Video processing can take minutes and requires a GPU. Decoupling
via a task queue lets the API respond immediately while workers process in the
background. WebSockets push progress updates to the client in real time.

---

## ADR-004 — Shared TypeScript package

**Decision**: Extract all API types and `fetch` wrappers into `shared/` and
consume from both web and mobile via a `@shared/*` path alias.

**Reason**: Web and mobile use the same language. A single source of truth for
types and API calls prevents divergence and means updating an endpoint requires
changing exactly one file.

---

## ADR-005 — Claude Vision API for basketball validation

**Decision**: Before running YOLOv8 detection, validate the uploaded video using
the Claude Vision API to confirm it contains a basketball game.

**Reason**: YOLOv8 detection is expensive (GPU time). Rejecting non-basketball
videos early saves compute and gives users fast, meaningful feedback.
