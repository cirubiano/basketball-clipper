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
| **D** | Editor de jugadas/ejercicios | ✅ Completado | Backend + shared + web (canvas + árbol + undo/redo) |
| **E** | Catálogo del club + TeamPlaybook | ✅ Completado | Backend + shared + web |
| **F** | Partidos, estadísticas, entrenamientos | ✅ Completado | Backend + shared + web |

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

**Completado en sesión 14:**
- [x] Tests de integración (players + roster) — `backend/tests/test_players_api.py` (15 tests: acceso, CRUD, RF-090 cascade, duplicados)
- [x] Mobile: pantalla de jugadores (`mobile/app/players/index.tsx`) — lista, crear, editar, archivar con confirmación
- [x] Mobile: pantalla de plantilla (`mobile/app/teams/[teamId]/roster.tsx`) — lista, añadir, editar stats, retirar
- [x] `mobile/app/_layout.tsx` actualizado con rutas `players/index` y `teams/[teamId]/roster`

**Estado**: ✅ Completado — ver sesión 14 del historial

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

**Completado en sesión 12:**
- [x] Modelo `Drill` + `Tag` + enums `DrillType`/`CourtLayoutType` + M2M `drill_tags`
- [x] Migración `0006_phase_d_drills.py`: tablas `tags`, `drills`, `drill_tags`; enums idempotentes
- [x] Router `drills.py`: 11 endpoints — tags CRUD + drills CRUD + clone + variants
- [x] `shared/types/drill.ts`: `DrillType`, `CourtLayoutType`, `SketchElement`, `SequenceNode`, `Tag`, `DrillSummary`, `Drill`
- [x] `shared/api/drills.ts`: funciones completas para tags y drills
- [x] Canvas editor: `CourtBackground.tsx`, `ElementRenderer.tsx`, `ElementPalette.tsx`, `PropertiesPanel.tsx`, `CourtCanvas.tsx`
- [x] Árbol de secuencias: `tree-utils.ts`, `SequenceTreePanel.tsx` (herencia de posición RF-188)
- [x] `useUndoRedo.ts`: hook genérico con historial inmutable (RF-250 a RF-252)
- [x] `DrillEditor.tsx`: orquestador — tabs, Ctrl+Z/Y/S, auto-save
- [x] Web `/drills`: biblioteca personal con tabs tipo/jugada, clone, archive
- [x] Web `/drills/[id]/edit`: página de edición con auto-save

**Estado**: ✅ Completado — ver sesión 12 del historial

---

## Fase E — Catálogo del club + TeamPlaybook

**Objetivo**: sistema de compartición de jugadas/ejercicios entre la biblioteca
personal, el catálogo del club y los playbooks de los equipos.

**Completado en sesión 13:**
- [x] Modelo `ClubTag` — etiquetas del catálogo del club (gestionadas por TD)
- [x] Modelo `ClubCatalogEntry` + M2M `catalog_entry_tags` — copias publicadas al catálogo
- [x] Modelo `TeamPlaybookEntry` — vínculo vivo drill ↔ equipo; soporta `is_frozen`
- [x] Drill model: añadidos flags `is_catalog_copy`, `is_team_owned`, `owned_team_id`
- [x] Migración `0007_phase_e_catalog_playbook.py`: nuevas columnas en drills + 4 tablas nuevas
- [x] Service `catalog.py`: `create_catalog_copy`, `copy_drill_to_library`, `push_changes_to_catalog`, `freeze_playbook_entries`, `freeze_all_club_playbook_entries`, `break_catalog_references`
- [x] Router `catalog.py` (prefix `/clubs`): tags CRUD + catálogo CRUD con 10 endpoints
- [x] Router `playbook.py` (prefix `/clubs`): 3 endpoints de playbook del equipo
- [x] `profiles.py` actualizado: archivado de perfil desencadena RF-164 (freezing) y RF-124 (ruptura de referencia)
- [x] `drills.py` actualizado: `GET /drills` filtra `is_catalog_copy` y `is_team_owned`
- [x] `shared/types/catalog.ts`: tipos `ClubTag`, `CatalogEntry`, `PlaybookEntry` + requests
- [x] `shared/api/catalog.ts`: funciones completas para tags + catálogo
- [x] `shared/api/playbook.ts`: `listPlaybook`, `addToPlaybook`, `removeFromPlaybook`
- [x] Web `/clubs/[clubId]/catalog`: vista del catálogo con publicar, copiar a biblioteca, actualizar copia, retirar
- [x] Web `/teams/[teamId]/playbook`: vista del playbook con añadir desde biblioteca, quitar, indicador de congelado
- [x] `Navbar.tsx` actualizado: enlaces contextuales a Catálogo y Playbook según perfil activo

**Estado**: ✅ Completado — ver sesión 13 del historial

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
- `Drill` — id, user_id, type (DrillType enum), court_layout (CourtLayoutType enum), title, description, root_sequence (JSON), is_catalog_copy, is_team_owned, owned_team_id, archived_at
- `Tag` — id, user_id, name, color, archived_at + M2M `drill_tags`
- `ClubTag` — id, club_id, name, color, archived_at
- `ClubCatalogEntry` — id, club_id, drill_id, published_by, archived_at + M2M `catalog_entry_tags`
- `TeamPlaybookEntry` — id, team_id, drill_id, added_by, is_frozen, archived_at

**Migraciones**
- `0001_initial_schema.py` — tablas base
- `0002_multipart_upload.py` — columnas multipart en Video
- `0003_add_video_title.py` — columna title
- `0004_phase_a_org_structure.py` — clubs, seasons, teams, club_members, profiles; is_admin en users; team_id en videos
- `0005_phase_c_players.py` — tablas players + roster_entries; enum playerposition (idempotente)
- `0006_phase_d_drills.py` — tablas tags, drills, drill_tags; enums DrillType, CourtLayoutType; DROP DEFAULT antes del ALTER TYPE
- `0007_phase_e_catalog_playbook.py` — columnas is_catalog_copy/is_team_owned/owned_team_id en drills; tablas club_tags, club_catalog_entries, catalog_entry_tags, team_playbook_entries

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
- `drills.py` — 11 endpoints: tags CRUD + drills CRUD + clone + variants; filtro is_catalog_copy/is_team_owned en GET
- `catalog.py` — 11 endpoints bajo prefix /clubs: tags del club CRUD + catálogo CRUD (RF-115 a RF-125)
- `playbook.py` — 3 endpoints bajo prefix /clubs: GET/POST/DELETE playbook del equipo (RF-160 a RF-169)

**Servicios**
- `storage.py` — S3/MinIO completo
- `detector.py` — YOLOv8, LAB, K-means, sliding window, progress callbacks
- `cutter.py` — FFmpeg, corte por segmentos, subida a S3
- `queue.py` — Celery, orquesta pipeline, actualiza BD, notifica WS
- `catalog.py` — lógica de negocio del catálogo: create_catalog_copy, copy_drill_to_library, push_changes_to_catalog, freeze_playbook_entries, break_catalog_references

### Shared (`shared/`)
- Tipos: `Video`, `VideoStatus`, `Clip`, `User`, `AuthTokens`, multipart types + `Club`, `Season`, `Team`, `ClubMember`, `Profile`, `UserRole`, `SeasonStatus`, `profileLabel()` + `Player`, `RosterEntry`, `PlayerPosition`, `POSITION_LABELS` + `DrillType`, `CourtLayoutType`, `SketchElement`, `SequenceNode`, `Tag`, `DrillSummary`, `Drill` + `ClubTag`, `CatalogEntry`, `PlaybookEntry`
- API: `uploadVideo()` con progreso/concurrencia/reanudación, CRUD vídeos y clips, clubs/seasons/teams/profiles API, `switchProfile()`, `clearProfile()` + `listPlayers`, `createPlayer`, `updatePlayer`, `archivePlayer`, `listRoster`, `addToRoster`, `updateRosterEntry`, `removeFromRoster` + drills API (tags CRUD + drills CRUD + clone) + catalog API (tags del club + catálogo completo) + `listPlaybook`, `addToPlaybook`, `removeFromPlaybook`

### Web (`web/`)
- Páginas: `/`, `/upload`, `/videos`, `/videos/[id]`, `/videos/[id]/clips/[clipId]`, auth, `/players`, `/teams/[teamId]/roster`, `/drills`, `/drills/[id]/edit`, `/clubs/[clubId]/catalog`, `/teams/[teamId]/playbook`
- Componentes: `FloatingUploadWidget`, `VideoUploader`, `VideoCard`, `ClipCard`, `ClipPlayer`, `ProcessingStatus`, `DeleteVideoDialog`, `ProfileSelector` + drill-editor: `CourtBackground`, `CourtCanvas`, `ElementRenderer`, `ElementPalette`, `PropertiesPanel`, `SequenceTreePanel`, `DrillEditor`
- Lib: auth context (con `activeProfile`, `switchProfile`, `clearActiveProfile`), uploadJob context, React Query

---

## Historial de sesiones

### 2026-05-01 — Sesión 24 (Auditoría completa: tests + cobertura)

**Objetivo**: subir cobertura de tests del backend, verificar calidad de código, estabilizar frontend.

**Tests escritos — 57 nuevos tests (114 → 171 total)**

| Archivo | Tests | Routers cubiertos |
|---|---|---|
| `tests/test_matches_api.py` | 19 | `matches.py`: list, create, get, update, archive, convocatoria, stats (con RF-101 y C-2) |
| `tests/test_trainings_api.py` | 19 | `trainings.py`: list, create, get, update, archive, drills CRUD, reordenar, asistencia |
| `tests/test_seasons_teams_api.py` | 19 | `seasons.py`: list, create, update status (RF-101 → 409); `teams.py`: list, create, get, archive |

**Cobertura antes → después**

| Módulo | Antes | Después |
|---|---|---|
| `seasons.py` | 41% | **100%** |
| `trainings.py` | 24% | **98%** |
| `teams.py` | 40% | **96%** |
| `matches.py` | 24% | **84%** |
| **TOTAL** | 67% | **77%** |

**Patrones técnicos confirmados**

- `session.add = MagicMock(side_effect=lambda obj: setattr(obj, 'id', 1))` para endpoints que crean ORM objects y luego los serializan con `model_validate`
- Para Season/Team (que tienen `server_default` en `created_at`): side_effect debe setear también `created_at`
- `session.scalars = AsyncMock(return_value=mock_scalars_obj)` para routers que usan `await db.scalars(stmt).all()` (seasons, teams)
- `session.execute = AsyncMock(return_value=mock_result)` para routers que usan `await db.execute(stmt)` (matches, trainings)
- Admin siempre bypasea `_require_team_member`, `_require_technical_director`, `_require_club_access`

**Verificaciones finales**: ESLint 0 errores ✔, TSC 0 errores ✔, 171 tests ✔

---

### 2026-05-01 — Sesión 23 (3 mejoras UX: avatares, variantes, dashboard TD)

**TAREA 1 — M2: Fotos de jugador más grandes**
- **`web/app/players/page.tsx`**: `PlayerAvatar` tamaño "md" (default de listas): `h-10 w-10` → `h-12 w-12`
- **`web/app/teams/[teamId]/roster/page.tsx`**: avatar inline `h-9 w-9` → `h-12 w-12`
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: añadidos avatares de iniciales (`h-12 w-12`) en la sección "Convocatoria" (jugadores convocados) y en "Añadir a la convocatoria" (no convocados)

**TAREA 2 — M6: Contador de variantes en DrillCard**
- **`backend/app/schemas/drill.py`**: campo `variant_count: int = 0` añadido a `DrillSummaryResponse`
- **`backend/app/routers/drills.py`**: `list_drills` ahora hace un GROUP BY COUNT para contar variantes por drill, luego usa `model_copy(update={"variant_count": ...})` para inyectarlo en la respuesta
- **`shared/types/drill.ts`**: `variant_count: number` añadido a `DrillSummary`
- **`web/app/drills/page.tsx`**: `DrillCard` muestra badge "X variante(s)" (gris neutro) cuando `!parent_id && variant_count > 0`

**TAREA 3 — Dashboard del Director Técnico**
- **`web/app/page.tsx`**: cuando el perfil activo es `technical_director`, muestra:
  - 4 stat cards: temporada activa (nombre + fechas), equipos activos (count), jugadores activos (count), nombre del club
  - Card "Próximo partido": el partido con `status=scheduled` más próximo de todos los equipos del club (con link al partido)
  - Card "Últimos entrenamientos": los 3 entrenamientos más recientes de todos los equipos, mezclados y ordenados por fecha desc (con links)
  - Skeleton loaders mientras cargan los datos
  - Usa `useQueries` para fetch paralelo de matches y trainings por equipo
  - Imports añadidos: `getSeasons`, `getTeams`, `listPlayers`, `listMatches`, `listTrainings`, `MATCH_LOCATION_LABELS`, `useQueries`, Card UI components, `Trophy`, `Dumbbell` icons

**Verificaciones**: `py_compile` ✔, ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-01 — Sesión 22 (4 mejoras post-auditoría Fase F)

**4 tareas independientes implementadas: validación convocatoria, resultado partido, reordenar ejercicios, ejercicios únicos.**

**TAREA 1 — C-2: Validación de convocatoria en stats [BLOQUEANTE]**
- **`backend/app/routers/matches.py`** (`upsert_match_stat`): antes de crear/actualizar un stat, verifica que el jugador esté en la convocatoria (`match_players`). Si no está, devuelve HTTP 422: `"El jugador {player_id} no está en la convocatoria de este partido."`

**TAREA 2 — C-8: Resultado del partido (our_score / their_score)**
- **`backend/app/models/match.py`**: añadidos `our_score: Mapped[int | None]` y `their_score: Mapped[int | None]`
- **`backend/app/schemas/match.py`**: campos opcionales en `MatchResponse` y `MatchUpdate`
- **`shared/types/match.ts`**: `our_score: number | null` y `their_score: number | null` en `Match` e `MatchUpdate`
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: muestra resultado en el header (solo cuando `status==="played"`); botón "Añadir resultado" / "Editar resultado" (solo para HC/TD); Dialog con dos inputs numéricos + `useEffect` para sincronizar el formulario al abrir

**TAREA 3 — M-3: Reordenar ejercicios del entrenamiento**
- **`backend/app/schemas/training.py`**: nuevo schema `TrainingDrillReorderItem`
- **`backend/app/routers/trainings.py`**: nuevo endpoint `PATCH .../trainings/{trid}/drills` — actualiza posiciones desde un mapping `drill_id → position`
- **`shared/types/training.ts`**: `TrainingDrillReorderItem` interface
- **`shared/api/trainings.ts`**: función `reorderTrainingDrills`
- **`web/app/teams/[teamId]/trainings/[trainingId]/page.tsx`**: botones ↑/↓ (ChevronUp/ChevronDown) en cada fila de ejercicio; `moveRow` helper construye el nuevo orden y llama a `reorderMut`

**TAREA 4 — M-1: Prevenir ejercicios duplicados en entrenamiento**
- **`backend/alembic/versions/0009_match_scores_drill_unique.py`** (nueva): añade `our_score`/`their_score` a `matches`; desduplicación SQL en `training_drills` antes de crear `UNIQUE(training_id, drill_id)`
- **`backend/app/routers/trainings.py`** (`add_training_drill`): check de duplicado (409) antes de insertar
- **`web/app/teams/[teamId]/trainings/[trainingId]/page.tsx`**: `onError` de `addDrillMut` detecta 409 y muestra toast sin cerrar el dialog

**Fix TypeScript**: `moveRow` usaba `typeof training.training_drills` (inválido si `training` es `undefined`) → reemplazado por `TrainingDrill[]` con import explícito

**Verificaciones**: `py_compile` ✔, `alembic upgrade head` ✔, ESLint 0 errores ✔, TSC 0 errores ✔, smoke test ✔

---

### 2026-05-01 — Sesión 21 (Auditoría UX Fase F — bugs y quick wins)

**Recorrido completo de los flujos de Partidos y Entrenamientos como HeadCoach.**

**BUG-1 — BLOQUEANTE — `drill.title` AttributeError (backend 500)**
- **`backend/app/routers/trainings.py`**: `td.drill.title` → `td.drill.name` (dos call sites). Cada `POST .../drills` y cada `GET` de un entrenamiento con ejercicios devolvía HTTP 500. Corregido por el agente durante la auditoría.

**BUG-2 — HTML entity en toast de entrenamiento**
- **`web/app/teams/[teamId]/trainings/page.tsx`**: `&quot;` en template literal → comillas normales. Corregido por el agente.

**C-4 — Control de cambio de estado del partido [FIX]**
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: la Badge de estado se reemplaza por un `<Select>` con opciones Programado/Jugado/Cancelado para HeadCoach y TD. Llama a `updateMatch` con `{ status }`.

**C-5 — Vinculación de vídeos (placeholder completado) [FIX]**
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: tab Vídeos ahora muestra los vídeos vinculados (con botón de desvincular) + formulario para vincular nuevos: Select de vídeos disponibles + Select de etiqueta (Scouting / Análisis post-partido / Otro) + botón Vincular. Se importan `updateMatch`, `addMatchVideo`, `removeMatchVideo` y se añaden las mutaciones correspondientes.

**C-3 — StatRow stale form en segunda edición [FIX]**
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: `key` de `StatRow` cambiado a `stat ? \`stat-\${stat.id}\` : \`nostat-\${mp.player_id}\`` para forzar recreación del componente cuando el stat cambia.

**C-1 — "Convocar a todos" button [FIX]**
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`**: botón "Convocar a todos" en la sección "Añadir a la convocatoria" que dispara `addPlayerMut` para todos los jugadores no convocados en paralelo.

**C-6 — Tipo de ejercicio en entrenamiento mostraba inglés [FIX]**
- **`web/app/teams/[teamId]/trainings/[trainingId]/page.tsx`**: `capitalize` + valor raw `"drill"/"play"` → `"Ejercicio"/"Jugada"` con ternario.

**C-7 — Breadcrumb "Equipo" con href incorrecto [FIX]**
- **`web/app/teams/[teamId]/trainings/page.tsx`**: eliminado `href` del item "Equipo" (el breadcrumb no debe navegar a una sección hermana).

**M-6 — `completedVideos` era variable muerta [FIX]**
- Ahora se usa realmente en la lógica de video linking (C-5).

**Issues que requieren diseño/API (pendientes):**
- **C-2**: Backend acepta stats para jugadores no convocados — requiere validación en router
- **C-8**: No hay campos de resultado (our_score/their_score) en Match — requiere migración
- **M-1**: API permite drill duplicado en un entrenamiento — requiere UNIQUE constraint o check
- **M-3**: No hay reordenación de ejercicios (ni API ni UI) — requiere PATCH /drills/reorder + drag-handle

**Verificaciones**: ESLint ✔, TSC ✔

---

### 2026-05-01 — Sesión 20 (Mejoras UX post-Fase F)

**4 tareas de mejora UX aplicadas tras completar la Fase F.**

**TAREA 0 — Dialog "Añadir ejercicio" con 3 opciones (RF-410b)**
- **`web/app/teams/[teamId]/trainings/[trainingId]/page.tsx`** (reescrito): dialog de añadir ejercicio con 3 modos — "Mi biblioteca" (select de drills personales), "Catálogo del club" (select de entradas del catálogo), "Crear nuevo" (nombre + tipo → `createDrill` + `addTrainingDrill` en cadena)
- Añadido enlace "Ver" (ExternalLink) en cada ejercicio de la lista → `/drills/${td.drill_id}/edit`

**TAREA 1 — Validación de fechas en temporadas**
- **`web/app/clubs/[clubId]/seasons/page.tsx`**: validación inline en `handleSubmit` — si `ends_at <= starts_at` muestra "La fecha de fin debe ser posterior a la fecha de inicio" sin enviar al backend
- **`backend/app/schemas/club.py`**: `@model_validator(mode="after")` en `SeasonCreate` — rechaza con 422 si `ends_at <= starts_at` (segunda línea de defensa)

**TAREA 2 — Enlace "Ver drill" en catálogo y playbook**
- **`web/app/clubs/[clubId]/catalog/page.tsx`**: botón ExternalLink en cada fila → `/drills/${drill.id}/edit`
- **`web/app/teams/[teamId]/playbook/page.tsx`**: botón ExternalLink siempre visible en cada fila → `/drills/${drill.id}/edit` (el botón de eliminar sigue siendo solo visible al hover)

**TAREA 3 — Componente Breadcrumb + integración en 12 páginas**
- **`web/components/layout/Breadcrumb.tsx`** (nuevo): componente con Home icon + items separados por ChevronRight; items con href son clickables, el último sin href es el título actual (bold)
- Añadido en 12 páginas:
  - Club: `/clubs/[clubId]/teams`, `/clubs/[clubId]/seasons`, `/clubs/[clubId]/members`, `/clubs/[clubId]/catalog`
  - Equipo: `/teams/[teamId]/matches`, `/teams/[teamId]/trainings`, `/teams/[teamId]/roster`, `/teams/[teamId]/playbook`
  - Detalle: `/teams/[teamId]/matches/[matchId]`, `/teams/[teamId]/trainings/[trainingId]` (reemplazan el botón ArrowLeft)
  - Personal: `/drills`, `/players`
- Usa `activeProfile.club_name` y `activeProfile.team_name` (no IDs)

**Verificaciones**: `py_compile` backend OK, ESLint 0 errores, TSC 0 errores

---

### 2026-05-01 — Sesión 19 (Fase F — Partidos y Entrenamientos)

**Implementación completa de la Fase F del roadmap.**

**PASO 0 — REQUIREMENTS.md §11**
- Añadidas secciones 11.1–11.4: modelo de dominio de `Match` (con `MatchVideo`, `MatchPlayer`, `MatchStat`) y `Training` (con `TrainingDrill`, `TrainingAttendance`), más RF-300 a RF-331 (Partidos) y RF-400 a RF-421 (Entrenamientos)
- Renombrada §11 anterior a §12

**PASO 1 — Backend**
- **`backend/app/models/match.py`** (nuevo): `Match`, `MatchLocation`, `MatchStatus`, `MatchVideoLabel` enums, `MatchVideo`, `MatchPlayer`, `MatchStat`
- **`backend/app/models/training.py`** (nuevo): `Training`, `TrainingDrill`, `TrainingAttendance`
- **`backend/app/models/__init__.py`**: re-exports de los nuevos modelos
- **Alembic `1f6f880ded2f_phase_f_matches_trainings.py`**: crea 7 tablas nuevas (`matches`, `trainings`, `match_players`, `match_stats`, `match_videos`, `training_attendances`, `training_drills`)
- **`backend/app/schemas/match.py`** (nuevo): `MatchCreate`, `MatchUpdate`, `MatchResponse`, `MatchVideoResponse`, `MatchPlayerResponse`, `MatchStatResponse`, `MatchVideoAdd`, `MatchStatUpsert`
- **`backend/app/schemas/training.py`** (nuevo): `TrainingCreate`, `TrainingUpdate`, `TrainingResponse`, `TrainingDrillResponse`, `TrainingAttendanceResponse`, `TrainingDrillAdd`, `AttendanceUpdate`
- **`backend/app/routers/matches.py`** (nuevo): 11 endpoints bajo `/clubs/{id}/teams/{tid}/matches` (CRUD + convocatoria + vídeos + estadísticas)
- **`backend/app/routers/trainings.py`** (nuevo): 10 endpoints bajo `/clubs/{id}/teams/{tid}/trainings` (CRUD + ejercicios + asistencia)
- **`backend/app/main.py`**: routers `matches` y `trainings` registrados

**PASO 2 — Shared**
- **`shared/types/match.ts`** (nuevo): enums + label maps + interfaces para `Match`, `MatchVideo`, `MatchPlayer`, `MatchStat`, `MatchCreate`, `MatchUpdate`, `MatchVideoAdd`, `MatchStatUpsert`
- **`shared/types/training.ts`** (nuevo): interfaces para `Training`, `TrainingDrill`, `TrainingAttendance`, `TrainingCreate`, `TrainingUpdate`, `TrainingDrillAdd`, `AttendanceUpdate`
- **`shared/types/index.ts`**: re-exports de `match` y `training`
- **`shared/api/matches.ts`** (nuevo): funciones `listMatches`, `createMatch`, `getMatch`, `updateMatch`, `archiveMatch`, `addMatchPlayer`, `removeMatchPlayer`, `addMatchVideo`, `removeMatchVideo`, `upsertMatchStat`
- **`shared/api/trainings.ts`** (nuevo): funciones `listTrainings`, `createTraining`, `getTraining`, `updateTraining`, `archiveTraining`, `addTrainingDrill`, `removeTrainingDrill`, `upsertAttendance`
- **`shared/api/index.ts`**: re-exports de `matches` y `trainings`

**PASO 3 — Web**
- **`web/app/teams/[teamId]/matches/page.tsx`** (nuevo): lista de partidos con filtro por temporada, dialog de creación, archivo con confirmación destructiva, navegación a detalle
- **`web/app/teams/[teamId]/matches/[matchId]/page.tsx`** (nuevo): detalle con 3 pestañas — Convocatoria (toggle add/remove jugadores), Vídeos (vinculados al partido), Estadísticas (tabla editable inline por jugador convocado)
- **`web/app/teams/[teamId]/trainings/page.tsx`** (nuevo): lista de entrenamientos con filtro, dialog de creación, archivo con confirmación destructiva
- **`web/app/teams/[teamId]/trainings/[trainingId]/page.tsx`** (nuevo): detalle con 2 pestañas — Ejercicios (lista ordenada con add/remove, dialog con select de biblioteca personal) y Asistencia (toggle por jugador de la plantilla)
- **`web/components/layout/Navbar.tsx`**: enlaces "Partidos" y "Entrenamientos" ahora apuntan a `/teams/{teamId}/matches` y `/teams/{teamId}/trainings` (quitado `soon` badge)

**Verificaciones**: 114 tests pasando, ESLint 0 errores, TSC 0 errores, grep checks OK

---

### 2026-05-01 — Sesión 18 (Mejoras UX del recorrido de producto)

**Basado en los hallazgos del recorrido UX (sesión 17). 6 tareas implementadas.**

**TAREA 1 — Página de gestión de entrenadores [B2]**
- **`web/app/clubs/[clubId]/members/page.tsx`** (nuevo): lista de miembros con email, perfiles asignados (equipo + temporada + rol); invitar por email con dialog; asignar a equipo (select temporada → equipo) con `POST /clubs/{id}/profiles`; retirar perfil con confirmación destructiva
- **Backend `backend/app/schemas/club.py`**: `AddMemberRequest` ahora acepta `email: str | None` además de `user_id`; `ClubMemberResponse` enriquecido con `user_email`; `ProfileResponse` enriquecido con `user_email`
- **Backend `backend/app/routers/clubs.py`**: `add_member` busca usuario por email si no se proporciona `user_id`; mensajes de error localizados; `list_members` carga `user` via `joinedload` para devolver email; nuevo endpoint `GET /clubs/{id}/profiles` (solo TD)
- **Backend `backend/app/routers/profiles.py`**: `_enrich_profile` incluye `user_email`
- **Shared `shared/types/club.ts`**: `ClubMember` y `Profile` añaden `user_email: string | null`
- **Shared `shared/api/clubs.ts`**: nueva función `addClubMemberByEmail(token, clubId, email)`; nueva función `getClubProfiles(token, clubId)`

**TAREA 2 — Fix de mensajes para usuario sin club [B1]**
- **`web/app/select-profile/page.tsx`**: texto cambiado a "Tu cuenta está activa. Si eres invitado a un club, tus perfiles aparecerán aquí."
- **`web/app/page.tsx`**: alerta informativa actualizada — ya no asume que el DT existe

**TAREA 3 — Mensaje informativo para DT en página de upload [C1]**
- **`web/app/upload/page.tsx`**: si el perfil activo es `technical_director`, muestra Alert informativo en lugar del formulario de subida. Explica que debe cambiar al perfil de entrenador.

**TAREA 4 — Enlace Playbook en navbar del HeadCoach [C5]**
- **`web/components/layout/Navbar.tsx`**: enlace "Playbook" añadido junto a "Mi Equipo" para head_coach con team_id

**TAREA 5 — Botón "Publicar al catálogo" en DrillCard [C2]**
- **`web/app/drills/page.tsx`**: DrillCard muestra botón "Publicar al catálogo" si el usuario tiene club activo. Carga el catálogo en paralelo con los drills para detectar cuáles ya están publicados (`original_drill_id`). Si ya está publicado, muestra badge "En catálogo del club" en verde en lugar del botón.

**TAREA 6 — Toast system global [C3]**
- **`web/lib/toast.tsx`** (nuevo): `ToastProvider` + `useToast()` sin dependencias externas. Toasts de 4 segundos, icono verde/rojo, botón de cierre manual. Posición: bottom-right.
- **`web/lib/providers.tsx`**: `ToastProvider` añadido al árbol de providers
- Toasts de éxito añadidos en: crear temporada, cambiar estado de temporada, crear equipo, archivar equipo, archivar drill, publicar al catálogo, invitar entrenador, asignar perfil, retirar perfil

**Navbar DT**: añadido enlace "Entrenadores" → `/clubs/${clubId}/members`

**Nuevos endpoints de backend:**
- `GET /clubs/{id}/profiles` — lista todos los perfiles activos del club (solo TD)
- `POST /clubs/{id}/members` ahora acepta `{ email: string }` además de `{ user_id: int }`

**Verificaciones finales:**
- `python -m py_compile app/schemas/club.py app/routers/clubs.py app/routers/profiles.py` → ALL OK
- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 errores
- Smoke test: login ✅ · me ✅ · profiles ✅
- `pytest tests/test_players_api.py` → 17 passed

---

### 2026-04-29 — Sesión 17 (Recorrido UX completo como Director Técnico)

**Metodología**: lectura de todas las páginas del frontend web + análisis de flujos de usuario reales. No revisión de código sino de UX: flujos rotos, pasos que faltan, friction.

**Páginas leídas**: register, login, select-profile, dashboard (page.tsx), seasons, teams, players, roster, drills, catalog, playbook, videos, matches/training (stubs), profile, not-found.

**Hallazgos — BLOQUEANTES (flujos que no se pueden completar sin intervención técnica)**

B1 — **No hay forma de crear un club desde la UI**
- `POST /clubs` requiere `is_admin`. Un DT que se registra queda sin club.
- El select-profile y el dashboard dicen "pide al director técnico que te invite" pero no contemplan el caso de que el propio usuario quiera ser DT y fundar el club.
- Workaround actual: solo via API directa o admin. No es autónomo.
- Fix propuesto (Fase F): nuevo endpoint `POST /clubs/self-provision` restringido a usuarios sin club existente, o un flujo de "solicitud de club" con aprobación admin.

B2 — **No hay página de gestión de miembros del club**
- La navbar del DT lista: Inicio / Equipos / Temporadas / Jugadores / Catálogo / Mi Biblioteca. Sin "Miembros".
- La API ya existe: `GET /clubs/{id}/members`, `POST /clubs/{id}/members`, `POST /clubs/{id}/profiles`.
- Sin esta página el DT no puede invitar a ningún entrenador. La plataforma es inutilizable en modo club real.
- Fix: página `/clubs/[clubId]/members` con tabla de miembros y formulario de invitación (rápido de implementar — la API ya está).

**Hallazgos — CONFUSO / FRICTION**

C1 — **El DT no puede subir vídeos** — hardcoded `!isTD` en dashboard y Navbar. Sin explicación ni alternativa. Si la restricción es intencional (los vídeos pertenecen a equipos y el DT no tiene team_id), la UI debería explicarlo o permitir al DT ver los vídeos de todos sus equipos.

C2 — **"Publicar al catálogo" no es descubrible** — desde `/drills` no hay botón de publicar. Solo desde el editor del drill. El catálogo tampoco tiene botón de publicar. Un usuario nuevo no descubre este flujo sin explorar el editor.

C3 — **Sin toasts de éxito** — Al crear equipo/jugador/temporada/drill, la modal cierra y la entidad aparece. No hay confirmación visual. Un usuario lento puede dudar si tuvo éxito.

C4 — **Registro sin nombre de usuario** — solo email + password. El dashboard usa `email.split("@")[0]` como saludo. Los jugadores tienen first_name/last_name, los usuarios no.

C5 — **Sin enlace directo al Playbook en la navbar del coach** — La navbar del coach tiene: Inicio / Mi Equipo (roster) / Catálogo / Mi Biblioteca. Para llegar al playbook hay que ir a roster y de ahí navegar.

C6 — **El mensaje de "sin perfil" en dashboard no ofrece el camino correcto para el caso DT** — El select-profile dice "Pide al director técnico que te invite". No hay camino para el DT que quiere crear su primer club.

**Hallazgos — MEJORAS MENORES**

M1 — Fechas de temporada sin validación cruzada (fecha fin puede ser antes de fecha inicio).
M2 — Fotos de jugadores en lista son muy pequeñas (32px / `size="sm"`). Con foto recortada a 32px no se distingue la cara.
M3 — Catálogo no enlaza al canvas del drill — solo muestra info, Copiar, Quitar. Sin enlace a detalle/editor.
M4 — Páginas "Próximamente" (Partidos, Entrenamientos) sin CTA alternativo (ej: "Mientras tanto, sube un vídeo").
M5 — Sin breadcrumbs — al estar en `/clubs/1/teams` no hay indicador del club activo más allá del título de la página.
M6 — DrillCard no muestra cuántas variantes tiene el drill. El badge "variante" solo aparece en las variantes, no en el drill padre.

**Quick wins implementables en próxima sesión (API ya existe)**
- [ ] Página `/clubs/[clubId]/members` — lista miembros + invitar + asignar rol
- [ ] Enlace "Playbook" en navbar del coach (1 línea)
- [ ] Botón "Publicar al catálogo" en DrillCard o desde la página de detalle del drill
- [ ] Toast system (instalar `sonner` o `react-hot-toast`) para feedback de éxito

**Candidatos Fase F (requieren diseño o nuevo backend)**
- Auto-provisioning de clubs (DT que crea su propio club sin intervención admin)
- Invitación de miembros por email con link de aceptación
- Vista del DT de todos los vídeos del club (por equipo)
- Dashboard del DT con métricas: n.º jugadores, equipos activos, último partido
- Notificación push cuando vídeo termina de procesar
- Breadcrumbs / estructura de navegación con contexto de club activo

---

### 2026-04-29 — Sesión 16 (Auditoría completa del frontend web)

**Auditoría ejecutada** — análisis estático + revisión visual de todas las páginas:

**Herramientas:**
- `docker exec basketball-clipper-web-1 npm run lint` → ESLint sobre toda la carpeta `web/`
- `docker exec basketball-clipper-web-1 npx tsc --noEmit` → TypeScript sobre `web/`
- Grep de patrones críticos: `apiClient`, `body: {`, `body: data`, imports root de shared, `<img>`, `value=""`
- Smoke test login completo (3 endpoints: `/auth/login`, `/auth/me`, `/profiles`)

**Errores encontrados y corregidos:**

1. **`web/app/players/page.tsx` — Parse error por comentario ESLint como nodo JSX**
   - Causa: `{/* eslint-disable-next-line @next/next/no-img-element */}` puesto como expresión dentro del `return()`, creando dos nodos hermanos sin wrapper (el comentario + el `<img>`). Tanto ESLint (`Parsing error: ')' expected`) como TypeScript fallaban con cascada de 8 errores.
   - Fix: reemplazado por `// eslint-disable-next-line` (comentario JS) dentro del bloque `return(...)` directamente antes del `<img>`.

2. **`web/app/drills/page.tsx` — Imports desde root de `@basketball-clipper/shared`**
   - Causa: tres imports usaban `@basketball-clipper/shared` (root) en lugar de los sub-paths `/api` y `/types` exigidos por CLAUDE.md.
   - Fix: reemplazados todos por `@basketball-clipper/shared/api` y `@basketball-clipper/shared/types`.

**Resultado final:**
- `npm run lint` → `✔ No ESLint warnings or errors`
- `npx tsc --noEmit` → 0 errores
- Smoke test: `/auth/login` ✅ · `/auth/me` ✅ · `/profiles` ✅

**Documentación añadida:**
- `CLAUDE.md`: nueva sección "Errores frecuentes detectados en auditoría" con descripción, causa, fix y comando de detección para cada patrón.

**Páginas revisadas sin errores** (auditoría visual):
- `app/page.tsx` (dashboard), `app/videos/page.tsx`, `app/clubs/[clubId]/catalog/page.tsx`
- `app/clubs/[clubId]/seasons/page.tsx`, `app/clubs/[clubId]/teams/page.tsx`
- `app/clubs/[clubId]/matches/page.tsx`, `app/clubs/[clubId]/training/page.tsx`
- `app/(auth)/register/page.tsx`, `app/select-profile/page.tsx`
- `components/layout/Navbar.tsx`

### 2026-04-27 — Sesión 15 (Gaps de UI — temporadas, equipos, perfil de usuario)

**Pantallas nuevas implementadas** (§9.1 de WEB_DESIGN_REQUIREMENTS.md):
- **`web/app/clubs/[clubId]/seasons/page.tsx`** (nuevo): gestión de temporadas del club — lista con badge de estado, crear nueva temporada (nombre, fechas opcionales), activar/archivar con confirmación destructiva para archivado; permisos TD en cliente
- **`web/app/clubs/[clubId]/teams/page.tsx`** (nuevo): gestión de equipos del club — lista filtrable por temporada, crear equipo (nombre + temporada), archivar con confirmación; aviso si no hay temporadas; permisos TD en cliente
- **`web/app/profile/page.tsx`** (nuevo): perfil de usuario — info de cuenta (email, tipo, fecha registro) + formulario de cambio de contraseña (contraseña actual, nueva, confirmación); feedback de éxito inline

**Backend:**
- **`backend/app/schemas/auth.py`**: añadido `ChangePasswordRequest` con validador mínimo 8 chars
- **`backend/app/routers/auth.py`**: añadido `PATCH /auth/me/password` (204) — verifica contraseña actual antes de actualizar

**Shared:**
- **`shared/api/auth.ts`**: añadida función `changePassword(token, currentPassword, newPassword)`
- **`shared/types/user.ts`**: añadido campo `is_admin: boolean` al tipo `User` (faltaba, backend ya lo devolvía)

**Navbar:**
- **`web/components/layout/Navbar.tsx`**: añadidos enlaces "Equipos" y "Temporadas" (solo TD con club activo); botón de perfil (`UserCircle`) para todos los usuarios; `aria-label` en botones de icono

**Verificaciones:** `py_compile schemas/auth.py routers/auth.py` ✅ ALL OK; archivos web sin truncamiento ✅; URLs coherentes con backend ✅; `grep apiClient shared/api/` → 0 ✅

### 2026-04-26 — Sesión 14 (Fase C — tests de integración + mobile jugadores/plantilla)

- **`backend/tests/test_players_api.py`** (nuevo): 15 tests — acceso sin perfil (403), creación (201/403), actualización, jugador archivado (409), soft-delete RF-090 (cascade a roster_entries), lista de plantilla, añadir a plantilla, duplicado (409), jugador archivado (404), actualizar stats, retirar (204), retirar ya archivado (409)
- **`mobile/app/players/index.tsx`** (nuevo): pantalla de jugadores — FlatList + modal crear/editar (TextInput + picker de posición en bottom sheet), confirmación de archivado con Alert
- **`mobile/app/teams/[teamId]/roster.tsx`** (nuevo): pantalla de plantilla — FlatList con dorsal/avatar/nombre/stats, modal añadir jugador (picker scrollable de disponibles), modal editar con stats (ppg/rpg/apg/mpg), confirmación de retirada
- **`mobile/app/_layout.tsx`** actualizado: registradas rutas `players/index` y `teams/[teamId]/roster` en el Stack
- Verificaciones: `py_compile tests/test_players_api.py` ✅ ALL OK

### 2026-04-26 — Sesión 13 (Fase E — Catálogo del club + TeamPlaybook)

**E1 — Backend:**
- **`backend/app/models/club_tag.py`**: modelo `ClubTag` — tags del catálogo del club
- **`backend/app/models/catalog.py`**: modelo `ClubCatalogEntry` + tabla M2M `catalog_entry_tags`
- **`backend/app/models/playbook.py`**: modelo `TeamPlaybookEntry` con `is_frozen` para RF-164
- **`backend/app/models/drill.py`**: añadidos `is_catalog_copy`, `is_team_owned`, `owned_team_id`
- **`backend/app/models/__init__.py`**: exports actualizados
- **`backend/app/schemas/catalog.py`**: schemas `ClubTagCreate/Update/Response`, `PublishToCatalogRequest`, `CatalogEntryResponse`, `UpdateCatalogTagsRequest`
- **`backend/app/schemas/playbook.py`**: schemas `AddToPlaybookRequest`, `PlaybookEntryResponse`
- **`backend/app/services/catalog.py`**: toda la lógica de negocio — copiar al catálogo, copiar a biblioteca, actualizar copia, congelar entradas, romper referencias
- **`backend/app/routers/catalog.py`**: 10 endpoints bajo prefix `/clubs` — tags CRUD + catálogo CRUD
- **`backend/app/routers/playbook.py`**: 3 endpoints bajo prefix `/clubs` — playbook GET/POST/DELETE
- **`backend/app/routers/profiles.py`**: cascade RF-164 (freeze) + RF-124 (break references) al archivar perfil
- **`backend/app/routers/drills.py`**: filtro `is_catalog_copy=False` + `is_team_owned=False` en GET /drills
- **`backend/app/main.py`**: registro de nuevos routers catalog y playbook
- **`backend/alembic/versions/0007_phase_e_catalog_playbook.py`**: migración completa

**E2 — Shared:**
- **`shared/types/catalog.ts`**: tipos `ClubTag`, `CatalogEntry`, `PlaybookEntry` + requests
- **`shared/api/catalog.ts`**: funciones para tags del club + catálogo completo (RF-120 a RF-125)
- **`shared/api/playbook.ts`**: `listPlaybook`, `addToPlaybook`, `removeFromPlaybook`
- **`shared/types/index.ts`** + **`shared/api/index.ts`**: exports actualizados

**E3 — Web:**
- **`web/app/clubs/[clubId]/catalog/page.tsx`**: catálogo del club — publicar, copiar a biblioteca, actualizar copia, retirar
- **`web/app/teams/[teamId]/playbook/page.tsx`**: playbook del equipo — añadir desde biblioteca, quitar, indicador de congelado (RF-164)
- **`web/components/layout/Navbar.tsx`**: enlaces contextuales a Catálogo y Playbook según perfil activo

**RFs implementados:** RF-115 a RF-119 (tags), RF-120 a RF-125 (catálogo), RF-130 (gestión TD), RF-150 (copia a biblioteca), RF-160 a RF-169 (playbook), RF-164 (copias congeladas), RF-124 (ruptura de referencias)

### 2026-04-25 — Sesión 12 (Fase D — editor de jugadas/ejercicios + arranque y fixes)

**D1 — Backend + Shared:**
- **`backend/app/models/drill.py`**: modelos `Drill`, `Tag`, enums `DrillType`/`CourtLayoutType`, tabla M2M `drill_tags`
- **`backend/app/schemas/drill.py`**: schemas Create/Update/Response para Drill y Tag
- **`backend/app/routers/drills.py`**: 11 endpoints — tags CRUD + drills CRUD + clone + variants; todos los DELETE devuelven `Response(status_code=204)`
- **`backend/alembic/versions/0006_phase_d_drills.py`**: tablas `tags`, `drills`, `drill_tags`; enums idempotentes; DROP DEFAULT antes del ALTER TYPE (ver CLAUDE.md §6 backend)
- **`shared/types/drill.ts`**: tipos `DrillType`, `CourtLayoutType`, `COURT_LAYOUT_LABELS`, `SketchElement`, `SequenceNode`, `Tag`, `DrillSummary`, `Drill`
- **`shared/api/drills.ts`**: funciones para tags y drills completas

**D2 — Canvas editor:**
- **`web/components/drill-editor/court-utils.ts`**: coordenadas normalizadas [0,1] ↔ SVG; dimensiones FIBA
- **`web/components/drill-editor/CourtBackground.tsx`**: SVG con todas las marcas FIBA (clave, arco 3pt, área restringida, tiro libre)
- **`web/components/drill-editor/ElementRenderer.tsx`**: renderizado de players, ball, cone, basket, lines con arrows
- **`web/components/drill-editor/ElementPalette.tsx`**: sidebar de herramientas con drag-and-drop
- **`web/components/drill-editor/PropertiesPanel.tsx`**: color, label, rotación, estilo de línea
- **`web/components/drill-editor/CourtCanvas.tsx`**: SVG interactivo — drop, drag, dibujo de líneas, teclado

**D3 — Árbol de secuencias + undo/redo:**
- **`web/lib/useUndoRedo.ts`**: hook genérico con historial inmutable
- **`web/components/drill-editor/tree-utils.ts`**: `createChildNode` con herencia de posición (RF-188)
- **`web/components/drill-editor/SequenceTreePanel.tsx`**: árbol navegable con edición de labels y confirmación de borrado
- **`web/components/drill-editor/DrillEditor.tsx`**: orquestador — tabs properties/sequences, Ctrl+Z/Y/S
- **`web/app/drills/page.tsx`**: biblioteca personal con tabs tipo/jugada, clone, archive
- **`web/app/drills/[id]/edit/page.tsx`**: página de edición con auto-save

**Fix Fase C:**
- **`backend/app/routers/players.py`**: corregido `AssertionError: Status code 204 must not have a response body` — todos los DELETE cambiados a `-> Response` retornando `Response(status_code=204)`

**Fixes de arranque (sesión 12):**
- **`shared/package.json`**: añadido `"."` al `exports` para permitir imports desde `@basketball-clipper/shared` (root) — necesario para drill-editor components
- **`shared/index.ts`**: nuevo archivo raíz que re-exporta `api/index` y `types/index`
- **`web/components/ui/dialog.tsx`**, **`alert-dialog.tsx`**, **`select.tsx`**: creados (faltaban en el proyecto)
- **`web/package.json`**: añadidos `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-select`
- **`backend/alembic/versions/0006_phase_d_drills.py`**: fix `DatatypeMismatchError` — DROP DEFAULT antes del ALTER TYPE en `court_layout`
- Múltiples archivos restaurados desde git por truncamiento del FUSE mount (PageShell, Navbar, auth.tsx, select-profile, videos/page, shared/api/auth.ts, clubs.ts)
- **`.idea/runConfigurations/Seed_Dev_Data.xml`**: fix "Interpreter not found" — cambiado a `C:\Windows\System32\cmd.exe /C`
- **Fase D marcada como ✅ Completado**

**Lección aprendida — Docker node_modules:**
Al añadir paquetes npm nuevos, el volumen `/app/node_modules` del contenedor Docker persiste los packages de la imagen anterior. Para forzar reinstalación limpia: `docker-compose down -v && docker-compose build web && docker-compose up`. Alternativa sin perder datos: `docker-compose exec web npm install <paquete>`.

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
- `shared/api/videoUpload.ts` — cliente multipart con progreso, concurrencia y rea