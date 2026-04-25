# Estado de implementación — Plataforma de Gestión de Clubs de Baloncesto

> **Instrucción para Claude**: actualiza este archivo al final de cada sesión.
> Marca con ✅ lo que se completó, actualiza los estados de las fases,
> y añade una entrada al historial de sesiones con fecha y resumen.

---

## Estado del roadmap

| Fase | Descripción | Estado | Notas |
|---|---|---|---|
| **A** | Estructura organizativa + auth multi-perfil | ✅ Completado | Backend completo + selector de perfil en web |
| **B** | Módulo de vídeo integrado en equipos | ✅ Completado | Backend + web + mobile + tests |
| **C** | Gestión de jugadores | ✅ Completado | Backend + shared + web completos |
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

**Estado**: ✅ Completado — ver sesión 7 del historial

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

**Completado en sesión 8:**
- [x] Requerir perfil activo (`get_current_profile`) en `GET /videos` y `POST /videos/init-upload`
- [x] Filtrar vídeos por equipo del perfil (HeadCoach/StaffMember) o por club completo (TechnicalDirector)
- [x] `init_upload` rechaza TechnicalDirector (403) — solo perfiles con team_id pueden subir
- [x] `GET /clips` y `GET /clips/{id}` filtrados por equipo del perfil activo
- [x] Web: nueva página `/select-profile` — selector de perfil a pantalla completa
- [x] Web: `PageShell` redirige a `/select-profile` si el usuario no tiene perfil activo
- [x] Web: retry con spinner individual por vídeo y manejo de error en dashboard y `/videos`
- [x] Mobile: `lib/auth.tsx` extendido con soporte de perfiles (`activeProfile`, `switchProfile`, `clearActiveProfile`)
- [x] Mobile: nueva pantalla `select-profile.tsx` — selector de perfil con spinner por item
- [x] Mobile: `_layout.tsx` actualizado con guard de perfil (redirige a `/select-profile` si no hay perfil activo)
- [x] Mobile: `index.tsx` muestra vídeos del equipo usando `listVideos` en lugar de `getClips`
- [x] `shared/api/index.ts` corregido — faltaba `export * from "./videos"` (estaba truncado)

**Completado en sesión 10:**
- [x] `backend/tests/test_auth_api.py` — tests de todos los endpoints de auth (register, login, me, switch-profile, clear-profile); verifica que el JWT contiene `profile_id` y que switch-profile rechaza perfiles de otros usuarios
- [x] `backend/tests/test_videos_profile.py` — tests de filtrado por perfil activo en `GET /videos` y `GET /clips`; verifica 403 sin perfil activo, filtrado por `team_id`, 403 para TechnicalDirector en `init_upload`, y que el vídeo creado hereda el `team_id` del perfil
- [x] `backend/tests/test_multipart_upload.py` — actualizado para usar `get_current_profile` en init-upload; añadido `test_init_upload_rejected_for_technical_director`
- [x] `backend/app/main.py` — corregido truncamiento; routers de clubs/seasons/teams/video/clips/ws restaurados
- [x] `py_compile` sobre todos los archivos tocados en Fase B: ✅ ALL OK

**Pendiente (no bloqueante para Fase C):**
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

**Completado en sesión 11:**
- [x] Modelo `Player` (nivel club): nombre, fecha de nacimiento, posición, foto, `archived_at`
- [x] Modelo `RosterEntry` (nivel equipo/temporada): dorsal, posición, stats básicas (ppg/rpg/apg/mpg), `archived_at`
- [x] Migración `0005_phase_c_players.py`: tablas `players` + `roster_entries`, enum `playerposition`, UNIQUE (player, team, season)
- [x] Router `players.py` con 9 endpoints: CRUD jugadores + CRUD plantilla; permisos por rol (TD/HC/Admin)
- [x] Soft-delete RF-090: archivar jugador retira de todas las plantillas activas
- [x] `shared/types/player.ts`: tipos `Player`, `RosterEntry`, enums `PlayerPosition`, labels `POSITION_LABELS`
- [x] `shared/api/players.ts`: `listPlayers`, `createPlayer`, `updatePlayer`, `archivePlayer`, `listRoster`, `addToRoster`, `updateRosterEntry`, `removeFromRoster`
- [x] Web `/players`: lista de jugadores del club con crear/editar/archivar en dialog
- [x] Web `/teams/[teamId]/roster`: plantilla por equipo con añadir/editar stats/retirar
- [x] Navbar actualizada con enlace "Jugadores"
- [x] `py_compile` sobre todos los archivos Python ✅ ALL OK

**Pendiente:**
- [ ] Tests de integración (players + roster)
- [ ] Mobile: pantallas de jugadores y plantilla

**Estado**: ✅ Completado — ver sesión 11 del historial

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

## Detalle técnico — módulos construidos

### Backend (`backend/`)

**Core**
- `config.py` — Pydantic Settings; incluye parámetros del detector
- `database.py` — SQLAlchemy async con pool
- `security.py` — JWT: `create_access_token(subject, profile_id?)`, `get_current_user`, `get_current_profile`, `require_admin`

**Modelos** (todos en `app/models/`)
- `User` — id, email, hashed_password, is_admin, created_at
- `Club` — id, name, logo_url, archived_at, created_at
- `Season` — id, club_id, name, status (SeasonStatus enum), start_date, end_date, archived_at
- `Team` — id, club_id, season_id, name, archived_at, created_at
- `ClubMember` — id, club_id (UNIQUE), user_id, invited_by, joined_at
- `Profile` — id, user_id, club_id, team_id (nullable for TechnicalDirector), role (UserRole enum), archived_at
- `Video` — id, user_id, team_id (nullable), title, filename, s3_key, status, upload parts, error_message
- `Clip` — id, video_id, s3_key, start_sec, end_sec, team, created_at
- `Player` — id, club_id, first_name, last_name, date_of_birth, position (PlayerPosition enum), photo_url, archived_at
- `RosterEntry` — id, player_id, team_id, season_id, jersey_number, position, ppg/rpg/apg/mpg, archived_at
- `Exercise` — stub

**Migraciones**
- `0001_initial_schema.py` — tablas base
- `0002_multipart_upload.py` — columnas multipart en Video
- `0003_add_video_title.py` — columna title
- `0004_phase_a_org_structure.py` — clubs, seasons, teams, club_members, profiles; is_admin en users; team_id en videos
- `0005_phase_c_players.py` — tablas players + roster_entries; enum playerposition (idempotente)

**Routers**
- `auth.py` — register, login, switch-profile, clear-profile, me
- `clubs.py` — CRUD clubs, gestión de miembros
- `seasons.py` — CRUD temporadas con validación de temporada activa única
- `teams.py` — CRUD equipos por club/temporada
- `profiles.py` — listar perfiles del usuario, asignar, archivar
- `video.py` — multipart upload lifecycle completo + gestión de jobs
- `clips.py` — CRUD clips
- `ws.py` — WebSocket progreso
- `players.py` — CRUD jugadores + CRUD plantilla; permisos TD/HC/Admin; soft-delete RF-090
- `exercises.py` — stub

**Servicios**
- `storage.py` — S3/MinIO completo
- `detector.py` — YOLOv8, LAB, K-means, sliding window, progress callbacks
- `cutter.py` — FFmpeg, corte por segmentos, subida a S3
- `queue.py` — Celery, orquesta pipeline, actualiza BD, notifica WS

### Shared (`shared/`)
- Tipos: `Video`, `VideoStatus`, `Clip`, `User`, `AuthTokens`, multipart types + `Club`, `Season`, `Team`, `ClubMember`, `Profile`, `UserRole`, `SeasonStatus`, `profileLabel()` + `Player`, `RosterEntry`, `PlayerPosition`, `POSITION_LABELS`
- API: `uploadVideo()` con progreso/concurrencia/reanudación, CRUD vídeos y clips, clubs/seasons/teams/profiles API, `switchProfile()`, `clearProfile()` + `listPlayers`, `createPlayer`, `updatePlayer`, `archivePlayer`, `listRoster`, `addToRoster`, `updateRosterEntry`, `removeFromRoster`

### Web (`web/`)
- Páginas: `/`, `/upload`, `/videos`, `/videos/[id]`, `/videos/[id]/clips/[clipId]`, auth, `/players`, `/teams/[teamId]/roster`
- Componentes: `FloatingUploadWidget`, `VideoUploader`, `VideoCard`, `ClipCard`, `ClipPlayer`, `ProcessingStatus`, `DeleteVideoDialog`, `ProfileSelector`
- Lib: auth context (con `activeProfile`, `switchProfile`, `clearActiveProfile`), uploadJob context, React Query

---

## Historial de sesiones

### 2026-04-25 — Sesión 11 (Fase C — gestión de jugadores)
- **`app/models/player.py`**: modelos `Player` (nivel club) y `RosterEntry` (nivel equipo/temporada) con enum `PlayerPosition`
- **`alembic/versions/0005_phase_c_players.py`**: tablas `players` + `roster_entries`; UNIQUE constraint `(player_id, team_id, season_id)`
- **`app/schemas/player.py`**: schemas Pydantic Create/Update/Response para Player y RosterEntry (con player embebido en RosterEntryResponse)
- **`app/routers/players.py`**: 9 endpoints bajo prefix `/clubs`; soft-delete archiva también todas las entradas de plantilla activas (RF-090)
- **`shared/types/player.ts`** + **`shared/api/players.ts`**: tipos y cliente completos; `POSITION_LABELS` para UI
- **`web/app/players/page.tsx`**: lista + crear/editar/archivar jugadores con dialog
- **`web/app/teams/[teamId]/roster/page.tsx`**: plantilla del equipo con dorsal, posición y stats
- **`web/components/layout/Navbar.tsx`**: añadido enlace "Jugadores"
- Verificaciones: `py_compile` ✅ ALL OK, `grep apiClient` → 0 ✅, rutas coherentes ✅
- **Fase C marcada como ✅ Completado**

### 2026-04-25 — Sesión 10 (Fase B — tests de integración + fix main.py)
- **`backend/tests/test_auth_api.py`** (nuevo): 7 tests — register OK (201), register conflict (409), login OK, login wrong password (401), login unknown email (401), me OK, me sin auth (401), switch-profile pone profile_id en JWT, switch-profile rechaza perfil ajeno (404), clear-profile elimina profile_id del JWT
- **`backend/tests/test_videos_profile.py`** (nuevo): 8 tests — list_videos require active profile (403), filtrado por team, lista vacía, init_upload forbidden para TechnicalDirector (403), allowed para HeadCoach (201), video hereda team_id del perfil, list_clips require active profile (403), clips filtrados por equipo
- **`backend/tests/test_multipart_upload.py`** (actualizado): init-upload tests migrados a `get_current_profile`; añadido `test_init_upload_rejected_for_technical_director`; resto de tests conservan `get_current_user`
- **`backend/app/main.py`** (fix): detectado y corregido truncamiento — faltaban los `include_router` de clubs, seasons, teams, video, clips, ws
- Verificaciones finales: `py_compile` sobre 9 archivos ✅ ALL OK
- **Fase B marcada como ✅ Completado**

### 2026-04-25 — Sesión 9 (Fase B — mobile + retry UI + fix shared/api)
- **`shared/api/index.ts`**: corregido truncamiento — añadido `export * from "./videos"` que faltaba
- **Web retry**: `VideoCard` recibe prop `isRetrying` — spinner + disabled mientras retrying; `onError` en ambas páginas muestra `Alert` con mensaje
- **Mobile `lib/auth.tsx`**: añadido soporte completo de perfiles (`activeProfile`, `profiles`, `switchProfile`, `clearActiveProfile`) usando `SecureStore` — alineado con web
- **Mobile `app/select-profile.tsx`**: nueva pantalla de selección de perfil con spinner por item
- **Mobile `app/_layout.tsx`**: guard de perfil — redirige a `/select-profile` si autenticado pero sin perfil activo
- **Mobile `app/index.tsx`**: usa `listVideos` filtrado por perfil activo; botón ⇄ para cambiar de club
- Verificaciones: `py_compile` ✅, grep apiClient → 0 ✅, `shared/api/index.ts` completo ✅

### 2026-04-25 — Sesión 8 (Fase B — integración backend + web)
- **Backend `video.py`**: `GET /videos` e `init_upload` usan `get_current_profile`; filtrado por `team_id` (HeadCoach/StaffMember) o por club completo (TechnicalDirector); `init_upload` rechaza `technical_director` con 403
- **Backend `clips.py`**: `GET /clips` usa `get_current_profile` con mismo filtrado por equipo/club
- **Web `PageShell`**: nueva prop `requireProfile` (default `true`); redirige a `/select-profile` si no hay perfil activo
- **Web `/select-profile`**: página nueva de selección de perfil a pantalla completa con spinner por item y mensaje si no hay perfiles asignados
- **CLAUDE.md**: añadidas secciones de verificación para shared/web (tsc, grep apiClient, smoke test login)
- Verificaciones: `py_compile` ✅, coherencia de rutas ✅, grep apiClient → 0 resultados ✅

### 2026-04-25 — Sesión 7 (Fase A completa)
- **Backend**: modelos Club, Season, Team, ClubMember, Profile; `is_admin` en User; `team_id` en Video
- **Migración** `0004_phase_a_org_structure.py` — crea todas las tablas de Fase A
- **Security**: `create_access_token` con `profile_id` opcional; `get_current_profile`, `require_admin`
- **Routers**: clubs, seasons, teams, profiles; switch-profile, clear-profile en auth
- **Shared**: tipos y API client para todas las entidades de Fase A
- **Web**: `ProfileSelector` component + auth context extendido con `activeProfile`, `switchProfile`, `clearActiveProfile`
- Todos los archivos nuevos/modificados verificados con `python -m py_compile` ✅

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
