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
| **F** | Partidos, estadísticas, entrenamientos | ✅ Completado | Backend + shared + web; state machine de partido (sesión 28) |
| **G** | Experiencia del entrenador (mejoras) | ✅ Completado | Favoritos, duration+auto-scheduling, calendario home, informes, grupos, generador |

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

**Completado (sesiones 21-28):**
- Partidos: CRUD + convocatoria + vídeos vinculados + estadísticas por jugador
- State machine de partido: scheduled → in_progress → finished | cancelled (endpoints dedicados, sin PATCH de status)
- Entrenamientos: CRUD + ejercicios del entrenamiento + asistencia
- Estadísticas: registradas durante `in_progress`, solo lectura en `finished`

**Estado**: ✅ Completado — ver sesiones 21-28 del historial

---

---

## Fase G — Experiencia del entrenador (mejoras)

**Objetivo**: mejorar la productividad del entrenador en el día a día, basado en análisis comparativo con aplicaciones del sector (mayo 2026).

**Qué incluye:**
- RF-500–503: Calendario de entrenamientos como home (frontend)
- RF-510–513: Duración por ejercicio + auto-scheduling visual
- RF-520–523: Grupos por ejercicio en entrenamientos
- RF-530–534: Generador automático de planes de entrenamiento
- RF-540–543: Informes de asistencia por equipo
- RF-550–552: Favoritos en ejercicios y jugadas

| Feature | Backend | Shared | Web | Estado |
|---|---|---|---|---|
| Favoritos (RF-550–552) | ✅ | ✅ | ✅ | ✅ Completado |
| Duration + auto-scheduling (RF-510–513) | ✅ | ✅ | ✅ | ✅ Completado |
| Calendario home (RF-500–503) | — | — | ✅ | ✅ Completado |
| Informes de asistencia (RF-540–543) | — | — | ✅ | ✅ Completado |
| Grupos por ejercicio (RF-520–523) | ✅ | ✅ | ✅ | ✅ Completado |
| Generador automático (RF-530–534) | ✅ | ✅ | ✅ | ✅ Completado |

**Estado**: ✅ Completado — sesión 34

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

### 2026-05-02 — Sesión 39 (UX Roadmap — #44 Empty states, #49 Optimistic updates)

**Objetivo**: completar los últimos ítems pendientes del UX_ROADMAP no-"Grande": empty states mejorados y optimistic updates ampliados.

**#44 Empty states con CTAs contextuales:**
- **`web/app/teams/[teamId]/roster/page.tsx`**: sustituido texto plano "Cargando..." por 3 skeleton rows; empty state mejorado con dashed border, icono `UserPlus` grande, texto descriptivo diferenciado por rol (coach/TD vs. staff), botón "Añadir primer jugador" (solo si es coach/TD). Añadida variable `isCoachOrTD` y `Skeleton` import.
- **`web/app/teams/[teamId]/playbook/page.tsx`**: empty state reemplazado — añadido icono `BookMarked`, título, descripción, dos botones ("Añadir jugada" + "Ir a Mi biblioteca" como Link). Añadidos imports `BookMarked` y `Link`.
- **`web/app/clubs/[clubId]/catalog/page.tsx`**: añadido CTA "Ir a Mi biblioteca para publicar" (Button asChild → Link /drills) al empty state del catálogo vacío.
- **`web/app/videos/[id]/page.tsx`**: empty state de 0 clips mejorado — si procesando: spinner animado + texto contextual; si terminado sin clips: icono 🎬 + mensaje explicativo.

**#49 Optimistic updates en mutaciones frecuentes:**
- **`web/app/drills/page.tsx`** (`archiveMut`): optimistic — marca `archived_at` instantáneamente en cache; rollback en error con snapshot de todas las queries `["drills"]`.
- **`web/app/players/page.tsx`** (`archiveMutation`): optimistic — marca `archived_at` en cache `["players", clubId]`; rollback en error.
- **`web/app/teams/[teamId]/roster/page.tsx`** (`removeMutation`): optimistic — elimina la entrada del roster del cache `["roster", clubId, teamId]` instantáneamente; rollback en error.

**Ítems del UX_ROADMAP verificados como ya implementados:**
Fases 1–3 completas (no-"Grande"), Fase 4 no-"Grande" (#36 thumbnails, #30 CSV, #40 notas playbook, #35 timeline). Los ítems "Grande" (#19, #31, #24, #45 de Fase 4; #47, #29 de Fase 5) anotados para futuras sprints.

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-02 — Sesión 38 (Fase 2 UX — Bloques E y F: paginación, vistas por rol, búsqueda global)

**Objetivo**: implementar los ítems de Fase 2 del UX_ROADMAP que no requieren cambios de navegación estructurales.

**Completado:**
- **#48 Paginación en listas grandes**: nuevo componente `web/components/ui/pagination-bar.tsx` (PaginationBar reutilizable con elipsis). Integrado en: `players/page.tsx` (25/pág), `teams/[teamId]/matches/page.tsx` (20/pág), `teams/[teamId]/trainings/page.tsx` (20/pág), `drills/page.tsx` (12 en grid / 20 en lista).
- **#9 Vista personalizada por rol**: dashboard `app/page.tsx` — HeadCoach con `teamId` ve ahora dos cards "Próximo partido" y "Próximo entrenamiento" con enlaces directos al detalle. Nueva query `coachMatches`. TD mantiene su vista completa.
- **#42 Búsqueda global Cmd+K / Ctrl+K**: nuevo componente `web/components/layout/CommandPalette.tsx` montado en el layout raíz. Abre con `Ctrl+K`/`Cmd+K` o `Esc`. Filtra en tiempo real sobre: páginas de navegación (siempre visibles), ejercicios/jugadas de la biblioteca personal, jugadores del club. Navegación con ↑↓ + Enter. Botón hint "Buscar · Ctrl K" visible en Navbar.
- **#51 Lazy loading editor canvas** (bonus Fase 1): `drills/[id]/edit/page.tsx` — `next/dynamic` + corrección imports root → sub-paths.

**Completado adicional (mismo bloque):**
- **#2 Bottom navigation mobile**: `web/components/layout/BottomNav.tsx` — barra fija inferior solo en `< md`, links adaptados al rol activo (TD / HeadCoach / personal), touch targets ≥ 44px, `aria-current="page"`. Montado en `layout.tsx` con `pb-16 md:pb-0` en el body para evitar solapamiento.
- **#1 Sidebar colapsable**: `web/components/layout/Sidebar.tsx` — sidebar sticky `md+`, modo expanded (220px) y rail (56px, solo iconos con tooltip). Toggle con estado persistido en `sessionStorage`. Integrado en `PageShell.tsx` como layout flex (sidebar + main).
- **#14 Navegación completa por teclado (WCAG 2.1 SC 2.1.1)**: skip link "Saltar al contenido principal" en `layout.tsx` con `sr-only focus:not-sr-only`. `id="main-content"` en el `<main>` de `PageShell`.

**Pendiente de Fase 2 (deprioritizado):**
- **#4 Master-detail layout** — disruptivo, prioridad Media. Se pospone.

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-02 — Sesión 37 (Fase 1 UX — Bloques C y D)

**Objetivo**: implementar las mejoras UX de la Fase 1 del `docs/UX_ROADMAP.md` (52 ítems).

**Bloque C — UX puntual completado:**
- **#17 Toast undo**: `web/lib/toast.tsx` — firma `toast(msg, type?, undoFn?)`, botón "Deshacer" en toast, timeout 6 s vs 4 s
- **#16 Unsaved guard**: `web/components/drill-editor/DrillEditor.tsx` — `window.onbeforeunload` + `window.confirm` al pulsar "Biblioteca"
- **#34 Save shortcut tooltip**: botón Guardar con `title="Guardar (Ctrl+S)"`
- **#32 Search in exercise dialog**: `web/app/teams/[teamId]/trainings/[trainingId]/page.tsx` — inputs de búsqueda filtrando biblioteca personal y catálogo en el dialog de añadir ejercicio
- **#33 Grid/list toggle**: `web/app/drills/page.tsx` — toggle segmentado (grid/lista), nuevo componente `DrillRow` para vista compacta
- **#5 Breadcrumb aria-current**: `web/components/layout/Breadcrumb.tsx` — `aria-current="page"` en último ítem (WCAG 2.4.8)

**Bloque D — Features nuevas completado:**
- **#50 Image compression**: `web/app/players/page.tsx` — `OUTPUT_SIZE` 400→320 px, calidad JPEG 0.92→0.82 (~40–80 KB para avatares)
- **#44 Empty states**: `web/app/teams/[teamId]/matches/page.tsx` y `trainings/page.tsx` — estados vacíos con dashed border, icono grande, título contextual, CTA y advertencia si no hay temporada activa
- **#8 Alerts dashboard**: `web/app/page.tsx` — panel de alertas para rol TD: aviso si no hay temporada activa + alerta partido próximo en ≤7 días con enlace directo
- **#22 PDF convocatoria**: `web/app/teams/[teamId]/matches/[matchId]/page.tsx` — botón "Imprimir" en la barra de tabs (solo visible en tab Convocatoria con jugadores); abre ventana nueva con HTML formateado (partido, fecha, lista de convocados) y llama `window.print()` automáticamente

**Bugs corregidos:**
- `Breadcrumb.tsx`: comentario `/* */` dentro de JSX causaba `TS1002 Unterminated string literal`; reemplazado por comentario `//`
- `matches/[matchId]/page.tsx`: truncación heredada de sesión anterior (línea 1283); restaurado el cierre de la tabla de stats y el componente `ActionButton`
- `DrillEditor.tsx`, `drills/page.tsx`, `trainings/[trainingId]/page.tsx`: archivos revertidos accidentalmente durante pruebas de tsc; re-aplicados todos los cambios vía scripts Python

**Bloque D — fix adicional:**
- **#51 Lazy loading editor canvas**: `web/app/drills/[id]/edit/page.tsx` — `DrillEditor` importado con `next/dynamic` + `ssr: false`; corregidos imports root → sub-paths (`/api`, `/types`). El bundle de canvas no se descarga hasta que el usuario abre el editor.

**Verificaciones**: ESLint 0 warnings/errores ✔, TSC 0 errores ✔

---

### 2026-05-02 — Sesión 36 (Prueba E2E completa Fases A–G — bugs y resultados)

**Objetivo**: prueba E2E de extremo a extremo de toda la plataforma (Fases A–G) con el perfil de DT (`admin@example.com`) y el perfil de HeadCoach (Infantil A). Cobertura de flujos: login → gestión de club → jugadores → editor de ejercicios/jugadas → catálogo → playbook → partidos → entrenamientos.

**Bugs encontrados y corregidos:**

**BUG-1 — `IntegrityError: duplicate key value violates unique constraint "uq_roster_player_team_season"` al añadir Alex Navarro a la plantilla**
- **Causa**: la sesión anterior había hecho un INSERT del jugador antes de crashear (null bytes en matches.py causaron reinicio de uvicorn). La entrada quedó archivada pero el UNIQUE constraint cubre todas las entradas independientemente de `archived_at`.
- **`backend/app/routers/players.py`** (`add_to_roster`): widened la query de comprobación de duplicados para incluir entradas archivadas — `select(RosterEntry).where(...sin filtro archived_at...)`. Devuelve HTTP 409 con mensajes distintos: "Player is already in this team's roster" (activo) vs. "Player was previously in this roster and cannot be re-added to the same season" (archivado).

**BUG-2 — `[object Object]` mostrado en formulario de creación de partido**
- **Causa**: FastAPI devuelve errores 422 con `detail` como array `[{loc: [...], msg: "...", type: "..."}]`. El constructor de `ApiError` hacía `String(rawDetail)` sobre el array, produciendo `"[object Object]"`.
- **`shared/api/client.ts`** (`ApiError` constructor): detecta si `rawDetail` es un array → mapea cada elemento a `"loc: msg"` filtrando `"body"` del `loc` → une con `"; "`. Las cadenas simples siguen funcionando igual. Fix aplica a todos los errores 422 de validación Pydantic en toda la plataforma.

**Resultados de la prueba E2E — todo ✅:**
- **Login y selector de perfil**: login → selector → perfil DT → switch a perfil HeadCoach. OK.
- **Gestión de club**: temporadas, equipos. Crear, activar, navegar. OK.
- **Jugadores y plantilla**: lista de jugadores, crear, añadir a plantilla, gestión de dorsales. OK tras BUG-1.
- **Editor de ejercicios/jugadas**: canvas interactivo, drag-and-drop de elementos, árbol de secuencias, Ctrl+Z, auto-save. OK.
- **Catálogo del club**: publicar drill al catálogo, copiar al catálogo. OK.
- **Playbook del equipo**: añadir jugada, ver canvas en dialog de solo lectura. OK (estado vacío correcto: el ejercicio E2E Test es tipo Ejercicio, no Jugada — solo jugadas van al playbook).
- **Partidos**: crear partido (con fix de [object Object]), iniciar, añadir stats, finalizar. OK tras BUG-2.
- **Entrenamientos**: crear entrenamiento, añadir ejercicio desde "Mi biblioteca", marcar asistencia en 3 estados (Presente/Retraso/Ausente+Lesión), guardar. OK.

**Verificaciones**: `py_compile backend/app/routers/players.py` ✅, ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-02 — Sesión 35 (Prueba E2E de Fase G + fix generador de planes)

**Objetivo**: validar con el perfil de entrenador (Coach / Infantil A) que todas las features de Fase G funcionan correctamente en el navegador.

**Corrección de bug detectado durante las pruebas:**

`web/app/teams/[teamId]/trainings/generate/page.tsx` — función `generateSessions`:
- **Bug**: el algoritmo iteraba `w = 0..weeks-1` y saltaba los slots con `daysOffset < 0`. Si el día de inicio caía después de los días seleccionados en la misma "semana 0" (ej: inicio en sábado, días L+X seleccionados), toda la semana 0 se saltaba y se generaban `weeks-1` semanas en lugar de `weeks`.
- **Síntoma**: paso 1 mostraba "8 sesiones" pero paso 3 generaba solo 6 (con inicio en sábado + L+X).
- **Fix**: para cada `dow` seleccionado, calcular el primer día en o después de `startDate` con `(dow - startDow + 7) % 7`, luego añadir `w * 7` para las semanas siguientes. Garantiza exactamente `days.length * weeks` sesiones siempre.

**Resultados de la prueba E2E — todo ✅:**
- Dashboard: calendario mes/semana funcionando, training dot en May 5 visible
- Training detail: duración inline (+ duración → Enter → tab muestra "20 min"), grupos modal (GRUPO 1 con jugadores, añadir GRUPO 2)
- Asistencia: 3 estados (Presente/Retraso/Ausente), motivo retraso opcional, motivo ausencia obligatorio (select Lesión/Personal/Sanción/Otro), save → toast "Asistencia guardada."
- Lista entrenamientos: "X/Y asistentes" en cada fila, Historial de asistencia tab con % coloreados
- Informe de asistencia: vista Por jugador y Entrenamientos, Exportar PDF visible, filtro de fechas
- Generador de planes: 3 pasos (Configuración → Ejercicios → Vista previa), Seleccionar todos, 8 sesiones confirmadas tras el fix, "8 entrenamientos creados." toast
- Favoritos: corazón → rojo, tab Favoritos filtra correctamente

**Verificaciones**: ESLint 0 errores ✔ (generate/page.tsx)

---

### 2026-05-01 — Sesión 33 (Auditoría completa del repositorio antes de entrega a entrenadores)

**Objetivo**: auditoría de 9 fases para garantizar calidad antes de la primera prueba real con usuarios.

**Resultado final:**
- pytest: **314/314 passed** (226 → 314, +88 tests nuevos)
- Cobertura backend: **78% → 85%** (+7 pp, superando el umbral mínimo)
- ESLint web: **0 errores** ✔
- TypeScript: **0 errores** ✔
- Smoke test (login → /auth/me → /profiles): **OK** ✔
- Git: limpio, `backend/.coverage` desrastreado del repo ✔

**Fix: `web/components/drill-editor/SequenceTreePanel.tsx`**
- `AlertDialogAction` del botón "Eliminar" usaba `className="bg-red-600 hover:bg-red-700"`
- Corregido a `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"` (regla shadcn/ui)

**Fix: `.gitignore`**
- Añadidos `.coverage`, `coverage.xml`, `htmlcov/` para evitar que pytest artifacts entren en el repo

**Nuevos tests (88 tests, 4 archivos):**

**`backend/tests/test_playbook_api.py`** (21 tests):
- list_playbook: vacío, con entradas, 404 club/equipo, equipo archivado, 403 sin acceso
- add_to_playbook: éxito, drill not found, propietario incorrecto, archivado, copia catálogo, equipo propio, 409 duplicado, 403 sin acceso
- remove_from_playbook: éxito (soft-delete), 404 entrada, 403 sin acceso

**`backend/tests/test_profiles_api.py`** (12 tests):
- list_my_profiles: vacía, con entradas (enriched names), sin team (TD), 401
- archive_profile: éxito con team (RF-164 freeze), sin miembros restantes (no freeze), TD (freeze_all), 404, ya archivado, 403

**`backend/tests/test_drills_api.py`** (37 tests):
- Tags: list, create, update (success/404/403/409), archive (success/404/409)
- Drills: list (vacío, con variant_counts, filtro type, filtro tag_id), create (success/tag inválido), get (success/404/403), update (success/archived/tag_ids/403), archive (success/404/409/403), clone (success/branches recursivo/403), create_variant (success/404/403)

**`backend/tests/test_misc_api.py`** (18 tests):
- clips: get_clip 404/success, list_clips TD path (sin team_id)
- auth: change_password success/wrong_current/401
- clubs: create/list_mine (vacío/con clubs)/get (success/404/403)/update
- security.py: real get_current_user (JWT válido, JWT inválido, user not in DB), require_admin non-admin 403

**Módulos cubiertos por primera vez o mejorados:**
- `app/routers/playbook.py`: 36% → 98%
- `app/routers/profiles.py`: 51% → 100%
- `app/routers/drills.py`: 26% → 94%
- `app/routers/clips.py`: 77% → 93%
- `app/routers/clubs.py`: 41% → 55%
- `app/core/security.py`: nueva cobertura de `get_current_user` y `require_admin`

---

### 2026-05-01 — Sesión 32 (Dashboard DT — estadísticas de equipo, asistencia y top performers)

**Objetivo**: añadir tres secciones nuevas al dashboard del Director Técnico usando datos ya cargados.

**Solo frontend — sin cambios en backend.**

**`web/app/page.tsx`** — tres secciones nuevas debajo de "Últimos entrenamientos":

**Sección 1 — Estadísticas por equipo (temporada actual)**
- Una card por equipo activo; usa los datos de `matchQueries` (ya cargados)
- Filtra `status === "finished"` y calcula: partidos jugados, victorias, derrotas
- Pts anotados / encajados: promedio por partido (solo si hay scores registrados)
- Estado vacío: "Sin partidos jugados esta temporada."
- Skeleton loader mientras `matchesLoading`; error no destructivo por card

**Sección 2 — Resumen de asistencia**
- Una card por equipo activo; usa los datos de `trainingQueries` (ya cargados)
- Calcula total de entrenamientos y % medio de asistencia del equipo
- Muestra los 3 jugadores con menor asistencia (nombre + % colorido: verde ≥80%, ámbar ≥60%, rojo <60%)
- Estado vacío: "Sin entrenamientos registrados."
- Skeleton loader mientras `trainingsLoading`; error no destructivo por card

**Sección 3 — Top performers**
- Una card global agregando TODOS los equipos
- Agrega stats de partidos `finished` por jugador: puntos, asistencias, rebotes totales
- Muestra máximo anotador, máximo asistente, máximo reboteador
- Usa `Array.from(map.values())` para compatibilidad con TypeScript es2015
- Estado vacío: "Sin estadísticas registradas esta temporada."
- Skeleton loader mientras `matchesLoading`

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-01 — Sesión 31 (Tests de integración — posiciones, ciclo de vida partido, asistencia)

**Objetivo**: añadir tests de integración para las tres features implementadas en las sesiones 27-29.

**Cobertura antes**: 171 tests, 75% global
**Cobertura después**: 226 tests, 78% global (+55 tests nuevos, todos en verde)

**Mejoras de cobertura por módulo:**
- `app/routers/positions.py`: 35% → 99% (+64 pp)
- `app/routers/matches.py`: 71% → 87% (+16 pp)
- `app/schemas/training.py`: 93% → 100% (+7 pp)
- `app/routers/players.py`: 81% → 85% (+4 pp)

**Nuevo `tests/test_positions_api.py`** (19 tests):
- GET/POST/PATCH/DELETE posiciones: happy path + 404 + permisos (staff → 403, sin token → 401)
- GET accesible por cualquier miembro del club (staff_member profile)
- Soft-delete: posición archivada no aparece en GET posterior
- Crear jugador con `position_ids=[id1, id2]` → response incluye ambas posiciones
- Crear jugador con `position_ids=[]` → `positions = []`
- `position_ids` con IDs de otro club → 422

**Nuevo `tests/test_match_lifecycle.py`** (19 tests):
- Transiciones válidas: scheduled→in_progress, in_progress→finished, scheduled→cancelled, in_progress→cancelled
- Transiciones inválidas → 409: in_progress→start, finished→start, cancelled→start, scheduled→finish, finished→finish, finished→cancel, cancelled→cancel
- Stats en `in_progress` → 200; stats en `finished` → 200 (edición post-partido)
- Jugador no convocado → 422
- Permisos: staff → 403, sin token → 401 en start/finish/cancel

**Nuevo `tests/test_attendance_api.py`** (17 tests):
- Presente (attended=True, is_late=False): nuevo + valor por defecto
- Retraso (attended=True, is_late=True, notes): nuevo + actualiza existente
- Ausente (attended=False, absence_reason): injury, personal, sanction, other+notes
- GET training detail: refleja is_late, absence_reason, notes en training_attendances
- Validaciones 422: attended=True + absence_reason; attended=False sin absence_reason; absent + is_late=True; enum inválido
- Resumen: conteos correctos de presentes/retrasos/ausentes en una lista de 3 asistencias

---

### 2026-05-01 — Sesión 30 (Upload desde la tab Vídeos del partido)

**Objetivo**: añadir acceso directo al upload desde la tab Vídeos del detalle de partido, con redirección automática al completar.

**Web — upload (`web/app/upload/page.tsx`):**
- Lee `returnTo` y `opponent` de los parámetros de URL (`useSearchParams`)
- Si hay `returnTo`: muestra botón ← (ArrowLeft) que vuelve a la URL de origen
- Si hay `returnTo`: muestra banner azul con mensaje contextual (rival si está disponible)
- `useEffect`: cuando `isDone && returnTo` → valida que empieza por `/` (prevención de open-redirect) → llama `clearJob()` y `router.push(returnTo)`
- Si `isDone && returnTo`: muestra "Redirigiendo al partido..." en lugar de los botones "Ver clips generados" / "Subir otro"
- TD sin equipo: sigue mostrando el banner de advertencia existente (sin cambios)

**Web — detalle de partido (`web/app/teams/[teamId]/matches/[matchId]/page.tsx`):**
- Añadido `Upload` a los imports de lucide-react
- Sección "Vincular vídeo": cabecera convertida en fila `flex items-center justify-between`
- Botón "Subir vídeo" (variant="outline", size="sm") con icono `Upload` enlaza a:
  `/upload?returnTo=/teams/${teamId}/matches/${matchId}&opponent=${encodeURIComponent(match.opponent_name)}`
- Estado vacío de `availableVideos`: mensaje actualizado para referenciar el botón "Subir vídeo"

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-01 — Sesión 29 (Asistencia a entrenamientos — 3 estados + histórico)

**Objetivo**: ampliar el modelo de asistencia de binario (presente/ausente) a tres estados: presente, con retraso, ausente (con motivo obligatorio).

**Backend:**
- Nueva migración `0012_training_attendance_states.py`: crea enum `absencereason` (injury/personal/sanction/other); añade `is_late` (bool, server_default=false), `absence_reason` (enum nullable), `notes` (text nullable) a `training_attendances`
- `app/models/training.py`: nuevo `AbsenceReason` enum; `TrainingAttendance` con los 3 campos nuevos
- `app/schemas/training.py`: `AttendanceUpdate` con `is_late`, `absence_reason`, `notes` + `model_validator` de consistencia (absent → absence_reason obligatorio; attended=True → absence_reason null; absent → is_late=false); `TrainingAttendanceResponse` con nuevos campos
- `app/routers/trainings.py`: `_serialize_training` y `upsert_attendance` actualizados con los campos nuevos
- **171 tests pasados ✅**

**Shared:**
- `shared/types/training.ts`: `AbsenceReason` tipo + `ABSENCE_REASON_LABELS`; `TrainingAttendance` con `is_late`, `absence_reason`, `notes`; `AttendanceUpdate` con campos nuevos

**Web — detalle de entrenamiento (`/trainings/[trainingId]/page.tsx`):**
- `localAttendance` cambia de `Map<number, boolean>` a `Map<number, LocalAttendanceRecord>` con `{ state, absence_reason, notes }`
- Tab Asistencia: control segmentado 3 botones [Presente | Retraso | Ausente] por jugador
  - "Retraso" → Input opcional "Motivo del retraso" (→ notes)
  - "Ausente" → Select obligatorio Lesión/Personal/Sanción/Otro; si Otro → Input notas
- Summary bar: "X presentes · Y con retraso · Z ausentes"
- Validación antes de guardar: jugadores ausentes sin motivo bloquean el save

**Web — lista de entrenamientos (`/trainings/page.tsx`):**
- Dos tabs: "Entrenamientos" (lista existente) y "Historial de asistencia"
- Tab Historial: tabla por jugador con Presencias / Retrasos / Ausencias / % Asistencia
  - % = (presencias + retrasos) / total · colorido (verde ≥80%, ámbar ≥60%, rojo <60%)
  - Ordenado por % descendente
  - Calculado client-side desde los datos ya cargados (sin query extra)
- Fila de lista: muestra "{N}/{M} asistentes" si hay datos

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔, 171 tests ✔, smoke test login ✔

---

### 2026-05-01 — Sesión 28 (Transiciones de estado de partido — state machine)

**Objetivo**: reemplazar el campo `status` editable libremente en PATCH por un estado máquina controlado con endpoints dedicados.

**Estado máquina implementado:**
- `scheduled` → `in_progress` vía `POST .../start` (solo si `match.date ≤ now`)
- `in_progress` → `finished` vía `POST .../finish`
- `scheduled | in_progress` → `cancelled` vía `POST .../cancel`
- Todos los endpoints devuelven 409 si la transición no es válida

**Backend:**
- Nueva migración `0011_match_status_transitions.py`: añade `in_progress` + `finished` al enum `matchstatus` (con `autocommit_block` — necesario en PostgreSQL para usar nuevos valores en DML en la misma migración); migra `played` → `finished` en los datos; `played` se mantiene en el tipo DB por compatibilidad pero se elimina del modelo Python
- `MatchStatus` enum en `app/models/match.py`: nuevo `in_progress`, `finished`, `cancelled`; eliminado `played`
- `MatchUpdate` en `app/schemas/match.py`: eliminado campo `status`
- `app/routers/matches.py`: 3 nuevos endpoints `POST .../start`, `POST .../finish`, `POST .../cancel`
- `tests/test_matches_api.py`: `test_update_match_modifies_fields` actualizado para no intentar patchear `status`
- **171 tests pasados ✅**

**Shared:**
- `shared/types/match.ts`: `MatchStatus` → `"scheduled" | "in_progress" | "finished" | "cancelled"`; `MATCH_STATUS_LABELS` actualizado; eliminado `status` de `MatchUpdate`
- `shared/api/matches.ts`: añadidas `startMatch`, `finishMatch`, `cancelMatch`

**Web — lista de partidos (`web/app/teams/[teamId]/matches/page.tsx`):**
- `STATUS_VARIANT` → `statusBadgeClass()`: scheduled=gris, in_progress=verde pulsante, finished=azul, cancelled=rojo tachado

**Web — detalle de partido (`web/app/teams/[teamId]/matches/[matchId]/page.tsx`):**
- Eliminado `updateStatusMut` + `<Select>` dropdown de estado
- Añadidos `startMut`, `finishMut`, `cancelMut`
- Header condicional por estado: botón "Iniciar partido" (solo si fecha ≤ now), "Finalizar partido", "Cancelar partido" (AlertDialog rojo)
- Score visible para `in_progress` y `finished` (antes solo `played`)
- Stats: editables solo en `in_progress`; read-only en `finished`; mensaje informativo en `scheduled`/`cancelled`
- Nuevo componente `CancelMatchDialog`

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔, 171 tests ✔

---

### 2026-05-01 — Sesión 27 (Posiciones dinámicas de club — reemplaza enum PlayerPosition)

**Objetivo**: reemplazar el enum estático `PlayerPosition` del jugador por posiciones dinámicas definidas por el club, con soporte completo en backend, shared y web.

**Backend:**
- Nuevo modelo `ClubPosition` (`club_positions` tabla) + association table `player_positions` (M2M)
- Nuevo archivo `app/models/club_position.py`; actualizado `app/models/__init__.py`
- `Player` model: eliminada columna `position` (enum), añadida relación M2M `positions: list[ClubPosition]`
- `PlayerPosition` enum MANTENIDO para `RosterEntry.position` (compatibilidad)
- Migración `0010_dynamic_club_positions.py`: crea `club_positions` + `player_positions`, elimina `players.position`
- Schemas (`app/schemas/player.py`): `ClubPositionBrief`, `ClubPositionCreate/Update/Response`; `PlayerCreate/Update` usan `position_ids: list[int]`; `PlayerResponse.positions: list[ClubPositionBrief]`
- Nuevo router `app/routers/positions.py`: 4 endpoints `GET/POST/PATCH/DELETE /clubs/{id}/positions`; helper `_load_positions`
- `app/main.py`: registrado `positions.router` con prefix `/clubs`
- `app/routers/players.py`: helper `_load_positions`; `selectinload(Player.positions)` en todas las queries de jugadores; `selectinload(RosterEntry.player).selectinload(Player.positions)` en roster; manejo de `position_ids` en create/update
- Tests actualizados (`test_players_api.py`): helper `_fake_player` actualizado, 3 tests corregidos para nuevo mock pattern con `session.execute`
- **171 tests pasados ✅**

**Shared:**
- `shared/types/player.ts` reescrito: eliminados `PlayerPosition` + `POSITION_LABELS`; añadidos `ClubPosition`, `ClubPositionCreate/Update/Detail`; `Player.positions: ClubPosition[]` reemplaza `Player.position`; nuevo `RosterPosition` + `ROSTER_POSITION_LABELS` (antes `PlayerPosition`)
- Nuevo `shared/api/positions.ts`: `listPositions`, `createPosition`, `updatePosition`, `archivePosition`
- `shared/api/index.ts`: export de `positions.ts`

**Web:**
- `web/app/clubs/[clubId]/positions/page.tsx` (NUEVO): página de gestión de posiciones — lista, crear/editar con color picker, archivar con confirmación
- `web/components/layout/Navbar.tsx`: añadido enlace "Posiciones" para TechnicalDirector
- `web/app/players/page.tsx`: `EMPTY_FORM` usa `position_ids: []`; query para `listPositions`; multi-select de posiciones (badges toggle) en dialog; badges de color en lista de jugadores
- `web/app/teams/[teamId]/roster/page.tsx`: `PlayerPosition` → `RosterPosition`, `POSITION_LABELS` → `ROSTER_POSITION_LABELS`; colored badges de `player.positions` en la tabla

**Verificaciones**: ESLint 0 errores ✔, TSC (web + shared) 0 errores ✔, 171 tests ✔

---

### 2026-05-01 — Sesión 26 (Frontend UX: 13 mejoras de interfaz)

**Objetivo**: 13 tareas de mejora de frontend sin cambios de backend.

**TAREA 1 — Navbar: eliminar botón "Subir vídeo"**
- Eliminado el bloque `{!isTD && (<>...</>)}` con los dos botones de upload
- Eliminado `Upload` de imports de lucide-react
- Eliminado `isTD` (ya no usado)

**TAREA 2 — Navbar: reemplazar icono UserCircle con avatar + email**
- El botón de perfil ahora muestra avatar circular con las 2 primeras letras del email como iniciales (`bg-primary/10`, `text-primary`, `h-8 w-8`)
- Mínimo 40px de altura (`min-h-[40px]`)
- Muestra el email completo en pantallas `lg:` (truncado a `max-w-[120px]`)
- Sigue enlazando a `/profile`
- Eliminado `UserCircle` de imports

**TAREA 3 — `/profile`: eliminar fila "Tipo de cuenta"**
- Eliminada la fila con `Badge` que mostraba "Administrador" / "Usuario"
- Eliminado import de `Badge`

**TAREA 4 — ProfileSelector: añadir "Espacio personal" siempre visible**
- Eliminado `if (profiles.length === 0) return null;` — el selector ahora siempre se renderiza
- Añadida opción "Espacio personal" al inicio de la lista, marcada activa cuando `!activeProfile`
- Llama a `clearActiveProfile()` al hacer clic; si ya está en espacio personal, solo cierra el dropdown
- Eliminado el botón "Cambiar de perfil o club" del pie del dropdown (reemplazado por esta opción)

**TAREA 5 — Roster: estadísticas acumuladas de partidos**
- Añadida query `listMatches(token, clubId, teamId)` para todos los partidos del equipo
- Agregación de `match_stats` por `player_id` (totales: PTS, MIN, AST, RD, RO, REC, PÉR, FAL)
- La tabla ahora usa `<table>` con columnas de stats leídas solo; las columnas de stats se muestran solo cuando `matches.length > 0`
- Edit dialog simplificado: solo muestra Dorsal + Posición (eliminadas las columnas ppg/rpg/apg/mpg)

**TAREA 6 — Roster: controles de ordenación**
- Añadido estado `sortBy: "jersey" | "position"` (por defecto "jersey")
- Botones "Dorsal" / "Posición" visibles cuando hay jugadores en la plantilla
- Sort ascending: dorsales numérico, posiciones por orden canónico (PB→SG→SF→PF→C)

**TAREA 7 — Roster: AlertDialog de confirmación antes de retirar**
- El botón Trash2 de cada jugador ahora abre un `AlertDialog` rojo antes de ejecutar la mutación
- `AlertDialogAction` con `className="bg-destructive ..."` conforme a las reglas de CLAUDE.md

**TAREA 8 — Playbook: filtrar solo jugadas (type=play)**
- `playbookEntries` filtra `entries.filter(e => e.drill.type === "play")`
- `availableDrills` filtra además `d.type === "play"` en el dialog de añadir
- El copy del h1 y el botón vacío actualizado a "jugadas"

**TAREA 9 — Playbook: botón borrar siempre visible**
- Eliminadas las clases `opacity-0 group-hover:opacity-100 transition-opacity` del botón Trash2
- Ahora siempre visible, manteniendo el color rojo destructivo

**TAREA 10 — Playbook: "Ver drill" abre Dialog con canvas de solo lectura**
- Reemplazado `<Link href="/drills/[id]/edit">` con botón "Ver" que abre un `Dialog`
- Nuevo componente `ReadOnlyCanvas` que renderiza `CourtBackground` + `ElementRenderer` en SVG sin interactividad
- Importa `getDrill` de shared/api y hace query lazy cuando se abre el dialog
- La acción de editar sigue disponible en la fila (click en título si eres el autor)
- El botón borrar envuelto en `AlertDialog` con confirmación (TAREA 9)

**TAREA 11 — Partidos: ordenar ascendente por fecha**
- En la lista de partidos, se ordena con `[...matches].sort((a,b) => new Date(a.date) - new Date(b.date))` antes de mapear

**TAREA 12 — Entrenamientos: asistencia por defecto "presente" + botón guardar**
- Los jugadores no registrados ahora aparecen con `attended: true` (en lugar de `false`)
- Se introdujo estado local `localAttendance: Map<number, boolean>` para ediciones pendientes
- Los toggles actualizan solo el estado local (no llaman a la API inmediatamente)
- Nuevo botón "Guardar asistencia" que hace batch de `upsertAttendance` en paralelo
- El botón está deshabilitado hasta que haya cambios (`attendanceDirty`)

**TAREA 13 — Entrenamientos: miniatura de canvas para cada ejercicio**
- Nuevo componente `DrillThumbnail` (80×60px SVG, `bg-zinc-800`, `viewBox` escalado)
- Usa `useQueries` de React Query para cargar detalles de todos los drills en paralelo
- Cada fila de ejercicio muestra la miniatura; clicking navega a `/drills/[id]/edit`
- Si el detalle no está cargado todavía, muestra un placeholder gris

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

### 2026-05-01 — Sesión 25 (Auth UX: espacio personal como estado por defecto)

**Objetivo**: eliminar la redirección forzada a /select-profile y hacer que el espacio personal sea el estado natural de un usuario sin perfil de club activo.

**TAREA 1 — `web/lib/auth.tsx`: Restaurar último perfil al hacer login**
- Nueva constante `LAST_PROFILE_KEY = "last_profile_id"`
- `hydrateFromToken`: si el JWT no lleva `profile_id`, intenta `localStorage.getItem("last_profile_id")` → si el id existe en la lista de perfiles activos → POST `/auth/switch-profile` → nuevo token guardado automáticamente
- `switchProfile`: ahora también hace `localStorage.setItem(LAST_PROFILE_KEY, id)` al cambiar de perfil
- `clearActiveProfile`: hace `localStorage.removeItem(LAST_PROFILE_KEY)` al volver al espacio personal
- `logout`: hace `localStorage.removeItem(LAST_PROFILE_KEY)` al salir

**TAREA 2 — `web/components/layout/PageShell.tsx`: Banner en lugar de redirección**
- Eliminado el `router.replace("/select-profile")` del `useEffect`
- Eliminado el `return null` que bloqueaba el render cuando `profiles.length > 0 && !activeProfile`
- Si `requireProfile=true` y no hay `activeProfile`: se muestra un banner ámbar (`border-amber-200 bg-amber-50`) con mensaje "Esta sección requiere un perfil de club. Selecciona uno desde el selector de perfil."
- En lugar de bloquear el render con `null`, se muestra solo el banner (no los hijos) para evitar crashes en páginas que asumen que hay un perfil activo

**TAREA 3 — `web/app/page.tsx`: Dashboard en espacio personal**
- Añadido import `profileLabel` desde `@basketball-clipper/shared/types`
- Añadido `profiles, switchProfile` al destructuring de `useAuth()`
- Sección "Tus clubs": si `!activeProfile && profiles.length > 0`, muestra lista de perfiles disponibles con botón "Cambiar a este perfil" por cada uno
- Sección cuando `!activeProfile && profiles.length === 0`: mensaje actualizado a "Cuando un club te invite, tus perfiles aparecerán aquí."

**TAREA 4 (TAREA 5 original) — Verificar redirects automáticos**
- `grep "select-profile" web/**/*.tsx` → solo queda la página `/select-profile/page.tsx` (accesible voluntariamente desde navbar pero no destino de ningún redirect automático)

**Flujo resultante**:
1. Login → `hydrateFromToken` → si hay `last_profile_id` en localStorage y perfil existe → switch automático → dashboard con perfil activo
2. Login sin historial → dashboard en espacio personal (sin redirección a /select-profile)
3. Cambiar perfil desde ProfileSelector → guarda `last_profile_id`; próximo login restaura ese perfil
4. "Cambiar de perfil o club" → elimina `last_profile_id`; próximo login queda en espacio personal
5. Acceder a /players sin perfil → banner ámbar en lugar de redirect

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

---

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
- **`backend/tests/test_videos_profile.py`** (nuevo): 8 tests — list_videos require active profile (403), filtrado por team, lista vacía, init_upload forbidden para TechnicalDirector (403), allowed para HeadCoach (201), v
---

### 2026-05-02 — Sesión 39 (Fase 3 UX — modo oscuro, navegación y optimistic updates)

**Objetivo**: continuar con los ítems de Fase 3 del UX_ROADMAP.

**Completado:**
- **#43 Modo oscuro**: nuevo componente `web/components/layout/ThemeToggle.tsx` — botón Sun/Moon con `mounted` guard (evita SSR mismatch), lee/escribe `localStorage.theme`, cae back a `prefers-color-scheme`. Montado en Navbar entre el hint de búsqueda y el selector de perfil. `globals.css` restaurado con paleta oscura completa (CSS vars slate/blue en bloque `.dark {}`). `tailwind.config.ts` ya tenía `darkMode: ["class"]`.
- **#49 Optimistic updates — favoritos**: `web/app/drills/page.tsx` — `favoriteMut` con `onMutate` que cancela queries en curso, snapshot del cache, actualización instantánea de `is_favorite` en todos los queries `["drills"]`, rollback en `onError`. Respuesta visual inmediata sin esperar el servidor.

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

**Completado adicional (sesión 39, continuación):**
- **#41 Onboarding guiado first-run**: nuevo componente `web/components/layout/OnboardingWizard.tsx` — dialog de 3 pasos (bienvenida → roles → CTAs), mostrado una sola vez (flag `localStorage "onboarding_v1_done"`), con progress dots, navegación Siguiente/Atrás, botón "Omitir". Montado en `layout.tsx`.
- **#21 Gráficas de barras para estadísticas**: nuevo componente `StatsBarChart` en `teams/[teamId]/matches/[matchId]/page.tsx` — tabs Puntos/Rebotes/Asistencias, barras horizontales CSS puras, barra líder resaltada en `primary`, aparece debajo de `StatsTable` cuando el partido está `finished`.
- **#37 Drop zone mejorada**: `VideoUploader.tsx` — overlay animado con `animate-bounce` al arrastrar, ring visual `ring-4 ring-primary/20`, badges de formato (MP4/MOV/AVI/MKV) y límite de tamaño visibles en reposo, mensaje "Suelta aquí para subir" claro al hover. `FloatingUploadWidget.tsx` — `subtitleFor` ahora muestra "Parte X de Y" durante subida; mini-barra de partes individuales (una pastilla por parte, activa/completada/pendiente) debajo del progress bar principal. `uploadJob.tsx` — añadidos `uploadedParts` y `totalParts` al `UploadJob` state e `EMPTY_JOB`.
- **#39 Vista previa del canvas en cards**: nuevo `web/components/ui/court-svg.tsx` — componente SVG compartido. Integrado en catálogo del club (`CatalogRow` muestra thumbnail 64×48px con el SVG de cancha), y en la biblioteca personal (`DrillCard`). `drills/page.tsx` ya no define `CourtSVG` localmente.

**Verificaciones**: ESLint 0 errores ✔, TSC 0 errores ✔

**Completado adicional (sesión 39, bloque final):**
- **#23 Drag-and-drop para reordenar ejercicios**: `trainings/[trainingId]/page.tsx` — atributo `draggable` en cada fila de ejercicio (solo para coach/TD), eventos `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`, feedback visual: fila arrastrada opaca + fila destino resaltada con `bg-accent/50 border-l-2 border-primary`. En el drop se llama directamente a `reorderMut` con el nuevo orden. Los botones ↑/↓ se mantienen como alternativa accesible (WCAG 2.2 SC 2.5.7).
- **#25 Plantillas reutilizables de entrenamiento**: nueva utilidad `web/lib/trainingTemplates.ts` con `loadTemplates`, `saveTemplate`, `deleteTemplate` (localStorage por team). En `trainings/[trainingId]/page.tsx`: botón "Guardar plantilla" (visible cuando hay drills) + dialog con campo nombre + confirmación. En `trainings/page.tsx`: picker de plantilla en el dialog de creación (Select con borrado individual), al crear con plantilla se llaman `addTrainingDrill` secuencialmente en el `onSuccess` de la mutación.

**Verificaciones finales sesión 39**: ESLint 0 errores ✔, TSC 0 errores ✔

---

**Resumen de Fase 3 UX completada (sesión 39):**
Todos los ítems de Fase 3 del `docs/UX_ROADMAP.md` han sido implementados:
#43 ✅ · #49 ✅ · #41 ✅ · #21 ✅ · #37 ✅ · #39 ✅ · #23 ✅ · #25 ✅
(#6 dashboard accionable: parcialmente hecho en sesión 38 con cards coach + alertas TD)
(#28 y #38 búsquedas: hechas en sesión 38)
(#27 grid jugadores: hecha en sesión 38)
---

### 2026-05-02 — Sesión 40 (Fase 4 UX — WeekStrip y thumbnails de clips)

**Completado:**
- **#7 Mini-calendario semanal**: nuevo componente `WeekStrip` en `web/app/page.tsx` — grid de 7 días (lun–dom) de la semana actual para coaches/TD. Cada día muestra partidos (azul primario) y entrenamientos (ámbar) del día. Hoy resaltado con anillo, días pasados en opacidad reducida. Links directos a detalle de partido/entrenamiento. Leyenda en la parte inferior. Montado en la sección HeadCoach del dashboard principal.
- **#36 Thumbnails automáticos en clips**: pipeline completo de extracción de thumbnails:
  - `backend/app/models/clip.py`: nuevo campo `thumbnail_s3_key: Mapped[str | None]`
  - `alembic/versions/0017_clip_thumbnails.py`: migración ADD COLUMN nullable
  - `backend/app/services/cutter.py`: nueva función `extract_thumbnail(clip_path, output_dir, clip_name)` — FFmpeg probe para obtener duración, seek al punto medio, extrae 1 frame JPEG 320×180. Fallos son no-bloqueantes (warn + return None)
  - `backend/app/services/queue.py`: stage 4 ahora llama `extract_thumbnail` por cada clip y sube el JPEG a `clips/{user_id}/{video_id}/thumbs/{clip_name}.jpg`; guarda `thumbnail_s3_key` en el registro Clip
  - `backend/app/schemas/clip.py`: `ClipResponse` tiene nuevo campo `thumbnail_url: str | None`
  - `backend/app/routers/clips.py`: `_to_response` genera presigned URL para `thumbnail_s3_key` si existe
  - `shared/types/clip.ts`: `Clip` interface añade `thumbnail_url: string | null`
  - `web/components/video/ClipCard.tsx`: muestra thumbnail como imagen de fondo con zoom en hover + overlay Play; fallback al icono Play si no hay thumbnail. Badge de duración con z-10
  - `web/components/video/ClipPlayer.tsx`: usa `thumbnail_url` como atributo `poster` del `<video>`

**Verificaciones**: Python py_compile ✅ ALL OK · ESLint 0 errores ✅ · TSC 0 errores ✅
---

### 2026-05-02 — Sesión 41 (Fase 4 UX — Anotaciones de coach en el playbook)

**Completado:**
- **#40 Anotaciones del coach en el playbook**: notas tácticas editables en cada entrada del playbook:
  - `backend/app/models/playbook.py`: nuevo campo `note: Mapped[str | None]` (Text, nullable)
  - `alembic/versions/0018_playbook_note.py`: migración ADD COLUMN `note TEXT NULL`
  - `backend/app/schemas/playbook.py`: nuevo schema `UpdatePlaybookNoteRequest`; `PlaybookEntryResponse` incluye `note: str | None`
  - `backend/app/routers/playbook.py`: nuevo endpoint `PATCH /{club_id}/teams/{team_id}/playbook/{entry_id}` — cualquier miembro del equipo puede editar la nota
  - `shared/types/catalog.ts`: `PlaybookEntry` añade `note: string | null`
  - `shared/api/playbook.ts`: nueva función `updatePlaybookNote`
  - `web/app/teams/[teamId]/playbook/page.tsx`: `PlaybookEntryRow` muestra icono `MessageSquare` + texto de la nota (o placeholder "Añadir nota..."). Click entra en modo edición con `<textarea>` autoFocus; Enter (sin Shift) o blur guarda; Escape cancela. Cambios sin modificar no disparan la mutación.

**Verificaciones**: Python py_compile ✅ ALL OK · ESLint 0 errores ✅ · TSC 0 errores ✅
---

### 2026-05-02 — Sesión 42 (Fase 4 UX — Importar jugadores desde CSV)

**Completado:**
- **#30 Importar jugadores desde CSV**: flujo completo de importación masiva de jugadores:
  - `backend/app/schemas/player.py`: nuevo schema `CsvImportResponse { created, skipped, errors }`
  - `backend/app/routers/players.py`: nuevo endpoint `POST /clubs/{id}/players/import-csv` — acepta `UploadFile` CSV, parsea con `csv.DictReader`, maneja UTF-8-sig (BOM) y latin-1 como fallback, columnas `first_name`/`last_name` obligatorias + `phone`/`date_of_birth` opcionales. Omite duplicados (mismo nombre en el club), acumula errores de fila sin detener la importación, requiere rol TD o HeadCoach.
  - `shared/types/player.ts`: interfaces `CsvImportError` y `CsvImportResult`
  - `shared/api/players.ts`: función `importPlayersFromCsv(token, clubId, file)` usando `FormData`
  - `web/app/players/page.tsx`: botón "Importar CSV" junto a "Nuevo jugador"; dialog con:
    - Enlace de descarga de plantilla CSV (`data:text/csv` con fila de ejemplo)
    - Drop zone drag-and-drop (con feedback visual) + input de archivo oculto
    - Muestra nombre y tamaño del archivo seleccionado
    - Botón "Importar" llama al endpoint; muestra resumen: creados (verde), omitidos, errores por fila con número de fila y mensaje
    - Cierre limpia el estado (archivo + resultado)

**Verificaciones**: Python py_compile ✅ ALL OK · ESLint 0 errores ✅ · TSC 0 errores ✅
---

### 2026-05-02 — Sesión 43 (Fase 4 UX — Timeline de posesiones en detalle de vídeo)

**Completado:**
- **#35 Timeline de posesiones** (versión simplificada sin reproductor de vídeo): nuevo componente `PossessionTimeline` en `web/app/videos/[id]/page.tsx`:
  - Barra horizontal proporcional a la duración del vídeo; cada clip ocupa su fracción exacta de tiempo (left + width en %)
  - Equipo A = azul (`bg-blue-500`), Equipo B = ámbar (`bg-amber-500`), soporte dark mode
  - Cada segmento es un enlace `<a>` al detalle del clip correspondiente con tooltip (nombre del equipo + timestamps)
  - Stats debajo: porcentaje de posesión por equipo, tiempo total por equipo, número de clips
  - Solo se muestra cuando el vídeo tiene clips disponibles
  - No requiere nuevos endpoints — usa los `start_time`/`end_time`/`team` ya presentes en cada `Clip`

**Verificaciones**: ESLint 0 errores ✅ · TSC 0 errores ✅
---

### 2026-05-02 — Sesión 44 (Fase 5 UX — Caché offline React Query)

**Completado:**
- **#52 Caché offline de datos clave**: persistencia manual del cache React Query en `localStorage` sin paquetes adicionales — misma semántica que `@tanstack/react-query-persist-client` pero sin dependencias nuevas. Implementado en `web/lib/providers.tsx`:
  - `saveCache(qc)`: serializa a `bc_rq_cache_v1` en localStorage todas las queries con status `success` cuyos keys empiezan por: `players`, `positions`, `roster`, `teams`, `seasons`, `members`, `drills`, `playbook`, `catalog`, `trainings`, `matches`. Ignorado en errores de cuota/serialización.
  - `restoreCache(qc)`: en el montaje inicial, restaura los datos (si tienen < 24h) con `qc.setQueryData`, sin sobreescribir datos más frescos. Si el JSON es inválido o caduca, limpia la entrada.
  - Guardado automático: `beforeunload` + intervalo de 2 min + `useEffect` cleanup. Excluidas consultas de auth y estado de upload.
  - `gcTime` actualizado a 10 min (> `staleTime` de 30s) para que los datos persistan en memoria durante el background refetch.
  - Los ítems "Grande" pendientes de Fase 4 (#19 vista en vivo, #31 canvas mobile, #24 modo en cancha, #45 notificaciones) quedan anotados para sprints futuros.

**Verificaciones**: ESLint 0 errores ✅ · TSC 0 errores ✅
