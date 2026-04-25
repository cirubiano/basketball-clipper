# Estado de implementación — Plataforma de Gestión de Clubs de Baloncesto

> **Instrucción para Claude**: actualiza este archivo al final de cada sesión.
> Marca con ✅ lo que se completó, actualiza los estados de las fases,
> y añade una entrada al historial de sesiones con fecha y resumen.

---

## Estado del roadmap

| Fase | Descripción | Estado | Notas |
|---|---|---|---|
| **A** | Estructura organizativa + auth multi-perfil | 🔴 No iniciado | Diseño de BD pendiente |
| **B** | Módulo de vídeo integrado en equipos | 🔶 Base construida | Standalone — pendiente integración con Fase A |
| **C** | Gestión de jugadores | 🔴 No iniciado | Requiere Fase A |
| **D** | Editor de jugadas/ejercicios | 🔴 No iniciado | La pieza más compleja. Requiere Fase C |
| **E** | Catálogo del club + TeamPlaybook | 🔴 No iniciado | Requiere Fase D |
| **F** | Partidos, estadísticas, entrenamientos | 🔴 No iniciado | Requiere Fase E |

---

## Fase A — Estructura organizativa + auth multi-perfil

**Objetivo**: construir el esqueleto organizativo sobre el que se apoya todo lo demás.
Sin esta fase, ninguna otra funcionalidad puede integrarse correctamente.

**Qué incluye:**
- Modelos de BD: `Club`, `Season`, `Team`, `Profile`, `ClubMember`
- Sistema de perfiles: un `User` puede tener múltiples perfiles con roles distintos en clubs distintos
- JWT con `profile_id` como claim (decisión tomada — ver `CLAUDE.md`)
- Selector de perfil en el frontend (RF-010 a RF-014)
- Permisos por contexto: `TechnicalDirector`, `HeadCoach`, `StaffMember`
- Panel de `Admin` independiente (RF-020 a RF-023)
- Migraciones Alembic para las nuevas tablas

**Estado**: 🔴 No iniciado — pendiente diseño detallado del esquema de BD

---

## Fase B — Módulo de vídeo integrado en equipos

**Objetivo**: integrar el pipeline de recorte de vídeo (ya construido) dentro del
contexto organizativo de la Fase A. Un miembro del staff sube vídeos asociados
a su equipo.

**Lo que ya existe (standalone):**

| Área | Estado | Notas |
|---|---|---|
| Backend core (FastAPI, auth, BD) | ✅ Construido | Auth simple — se extenderá en Fase A |
| Multipart upload a S3 | ✅ Completo | Browser → S3 directo, reanudable, 4 partes paralelas |
| Detector de posesión (YOLOv8) | ✅ Completo | LAB + K-means + sliding window |
| Detección de balón mejorada | ✅ Completo | |
| Cutter FFmpeg | ✅ Completo | |
| Pipeline Celery orquestado | ✅ Completo | Con progreso via WebSocket |
| WebSocket progreso | ✅ Completo | |
| Web — páginas de vídeos | ✅ Completo | /videos, /videos/[id], /videos/[id]/clips/[clipId] |
| Web — upload con widget flotante | ✅ Completo | FloatingUploadWidget persiste entre páginas |
| Web — reproductor de clips | ✅ Completo | |
| Web — auth (login/register) | ✅ Completo | |
| Mobile — estructura | 🔶 Scaffolded | Páginas creadas, lógica pendiente |
| Tests backend | 🔶 Parcial | Faltan tests de integración end-to-end |
| CI/CD GitHub Actions | ✅ Completo | Workflows backend, web, mobile |
| Infraestructura AWS (CDK) | 🔴 Skeleton | Sin recursos reales |

**Pendiente para completar Fase B** (tras tener Fase A):
- [ ] Migrar `Video` para que pertenezca a un `Team` (FK: `video.team_id`)
- [ ] Filtrar vídeos/clips por equipo del perfil activo
- [ ] Mobile: conectar a `shared/api`, upload y reproductor funcionales
- [ ] Tests de integración end-to-end
- [ ] Gestión de errores en web: retry manual desde UI
- [ ] Evaluar modelo YOLO: ¿`yolov8n.pt` es suficiente? (ver `backend/models/README.md`)
- [ ] Infraestructura AWS básica para staging

---

## Fase C — Gestión de jugadores

**Objetivo**: gestionar jugadores a nivel de club (datos personales) y a nivel de
equipo/temporada (datos deportivos, plantillas).

**Qué incluye (según `REQUIREMENTS.md` §11 — pendiente de detallar):**
- Datos personales del `Player` a nivel de club (transversales a temporadas)
- Datos deportivos por equipo: dorsal, posición, estadísticas básicas
- Plantillas por equipo/temporada
- Soft-delete de jugadores (RF-090 a RF-092)
- UI para gestión de plantilla

**Estado**: 🔴 No iniciado — requisitos detallados pendientes de definir en `REQUIREMENTS.md`

---

## Fase D — Editor de jugadas y ejercicios

**Objetivo**: implementar el módulo más complejo de la plataforma: editor de canvas
interactivo para crear y editar jugadas (`Play`) y ejercicios (`Drill`).

**Qué incluye** (según `REQUIREMENTS.md` §9):
- `PersonalLibrary`: biblioteca personal de cada usuario (transversal a clubs/equipos)
- Sketch editor canvas con drag & drop (RF-200 a RF-221):
  - Elementos: jugadores ofensivos/defensivos, balón, conos, canasta, líneas de movimiento
  - 4 tipos de cancha: `full_fiba`, `half_fiba`, `mini_fiba`, `half_mini_fiba`
  - Panel de propiedades por elemento
- Árbol de secuencias `SequenceNode` (RF-180 a RF-193):
  - Árbol de estados de la cancha (no lista lineal)
  - Ramas alternativas con etiqueta de condición
  - Herencia de posición al crear nodo hijo (RF-188)
  - Almacenado como JSON en PostgreSQL
- Undo/redo (RF-250 a RF-252)
- Descripción con texto enriquecido + auto-relleno (RF-240 a RF-242)
- Variantes entre jugadas/ejercicios (RF-140 a RF-144)
- Autoría: solo el autor puede editar (RF-126)

**Estado**: 🔴 No iniciado — la fase más compleja, planificar con detalle antes de empezar

---

## Fase E — Catálogo del club + TeamPlaybook

**Objetivo**: sistema de compartición de jugadas/ejercicios entre la biblioteca
personal, el catálogo del club y los playbooks de los equipos.

**Qué incluye** (según `REQUIREMENTS.md` §9.3-9.6):
- `ClubCatalog`: ejercicios/jugadas publicados al club (copias con referencia al original)
- `TeamPlaybookEntry`: vínculo vivo entre una jugada y un equipo
- Reglas de copia congelada cuando el autor sale del equipo (RF-164)
- Tags personales vs. tags del club (RF-115 a RF-119)
- Gestión del catálogo por el `TechnicalDirector` (RF-130)

**Estado**: 🔴 No iniciado — requiere Fase D completa

---

## Fase F — Partidos, estadísticas y entrenamientos

**Objetivo**: funcionalidades de seguimiento deportivo (según `REQUIREMENTS.md` §11).

**Pendiente de detallar en `REQUIREMENTS.md`:**
- Partidos: creación, convocatoria, resultado, estadísticas
- Estadísticas: métricas por jugador/equipo/temporada
- Entrenamientos/sesiones: planificación, asistencia, vínculo con ejercicios

**Estado**: 🔴 No iniciado — requisitos por definir

---

## Detalle técnico — módulos construidos (Fase B base)

### Backend (`backend/`)

**Core**
- `config.py` — Pydantic Settings; incluye parámetros del detector
- `database.py` — SQLAlchemy async con pool
- `security.py` — JWT: `create_access_token`, `get_current_user`

**Modelos actuales**
- `User` — id, email, hashed_password, created_at
- `Video` — id, user_id, title, filename, s3_key, status, upload_id, s3_parts, error_message
- `Clip` — id, video_id, s3_key, start_sec, end_sec, team, created_at
- `Exercise` — stub

**Migraciones**
- `0001_initial_schema.py` — tablas base
- `0002_multipart_upload.py` — columnas multipart en Video
- `0003_add_video_title.py` — columna title

**Routers**
- `auth.py` — register, login
- `video.py` — multipart upload lifecycle completo + gestión de jobs
- `clips.py` — CRUD clips
- `ws.py` — WebSocket progreso
- `exercises.py` — stub

**Servicios**
- `storage.py` — S3/MinIO completo
- `detector.py` — YOLOv8, LAB, K-means, sliding window, progress callbacks
- `cutter.py` — FFmpeg, corte por segmentos, subida a S3
- `queue.py` — Celery, orquesta pipeline, actualiza BD, notifica WS

### Shared (`shared/`)
- Tipos: `Video`, `VideoStatus`, `Clip`, `User`, `AuthTokens` + multipart types
- API: `uploadVideo()` con progreso/concurrencia/reanudación, CRUD vídeos y clips

### Web (`web/`)
- Páginas: `/`, `/upload`, `/videos`, `/videos/[id]`, `/videos/[id]/clips/[clipId]`, auth
- Componentes: `FloatingUploadWidget`, `VideoUploader`, `VideoCard`, `ClipCard`, `ClipPlayer`, `ProcessingStatus`, `DeleteVideoDialog`
- Lib: auth context, uploadJob context, React Query

---

## Historial de sesiones

### 2026-04-25 — Sesión 6 (planificación estratégica)
Sin commits — sesión de análisis y documentación.
- Análisis del documento `REQUIREMENTS.md` (plataforma completa de gestión de clubs)
- Decisión: el módulo de vídeo actual es la base de la Fase B de un proyecto más amplio
- Decisión arquitectónica: JWT con `profile_id` como claim (más seguro que header separado)
- Decisión: monorepo con stack actual (FastAPI + Next.js) — válido para todas las fases
- Definido roadmap de 6 fases (A → F)
- `REQUIREMENTS.md` incorporado al repositorio
- `CLAUDE.md` actualizado para reflejar la plataforma completa
- `PROGRESS.md` restructurado con el roadmap completo

### 2026-04-25 — Sesión 5 (mejoras detector de balón)
**Commit**: `7bdcd65`
- Mejoras en `detector.py`: optimizaciones en detección del balón
- Añadido `backend/.env.example` con variables del detector
- Añadido `backend/models/README.md` — guía para modelos YOLO custom
- Ajustes en `docker-compose.yml`

### 2026-04-25 — Sesión 4 (detector LAB + K-means)
**Commit**: `5eea9c9`
- Reescritura de `detector.py`: LAB, K-means K=2, sliding window, forward-fill, progress callbacks
- Todos los parámetros del detector expuestos como env vars
- `tests/test_detector.py` ampliado

### 2026-04-25 — Sesión 3 (UI + upload rápido)
**Commit**: `d60cb01`
- Eliminado `validator.py` (Claude Vision) — simplifica el pipeline
- `FloatingUploadWidget` — progreso de upload persiste entre páginas
- Nuevas páginas web: `/videos`, `/videos/[id]`, `/videos/[id]/clips/[clipId]`
- `VideoCard`, `DeleteVideoDialog` añadidos
- Migración `0003_add_video_title.py`

### 2026-04-24 — Sesión 2 (multipart upload)
**Commit**: `0f5d12b`
- Multipart upload S3 completo en `storage.py` y `video.py`
- `shared/api/videoUpload.ts` — cliente multipart con progreso, concurrencia y reanudación
- Migración `0002_multipart_upload.py`
- `tests/test_multipart_upload.py`
- `scripts/preflight.py`

### 2026-04-24 — Sesión 1 (inicial)
**Commits**: `434fa5e` + `c8b9753`
- Estructura base del monorepo
- Backend: modelos, routers, servicios, auth, Alembic
- Web: Next.js 14 setup, componentes base, auth
- Mobile: estructura y scaffolding
- CI/CD GitHub Actions
- Migración `0001_initial_schema.py`
