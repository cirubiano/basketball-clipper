# Basketball Clipper — Estado de implementación

> **Instrucción para Claude**: actualiza este archivo al final de cada sesión.
> Marca con ✅ lo que se completó, añade entradas al historial de sesiones,
> y actualiza los apartados "En curso" y "Pendiente Fase 1".

---

## Resumen rápido — Fase 1

| Área | Estado | Notas |
|---|---|---|
| Backend core (FastAPI, auth, BD) | ✅ Completo | |
| Multipart upload a S3 | ✅ Completo | Browser → S3 directo, reanudable |
| Detector de posesión (YOLOv8) | ✅ Completo | LAB + K-means + sliding window |
| Detección de balón mejorada | ✅ Completo | Ver sesión 2026-04-25 |
| Cutter FFmpeg | ✅ Completo | |
| Pipeline Celery orquestado | ✅ Completo | Con progreso via WebSocket |
| WebSocket progreso | ✅ Completo | |
| Web — páginas de vídeos | ✅ Completo | /videos, /videos/[id] |
| Web — upload con progreso flotante | ✅ Completo | FloatingUploadWidget persistente |
| Web — reproductor de clips | ✅ Completo | /videos/[id]/clips/[clipId] |
| Web — auth (login/register) | ✅ Completo | |
| Mobile — estructura y navegación | 🔶 Scaffolded | Páginas creadas, lógica pendiente |
| Tests backend | 🔶 Parcial | Faltan tests de integración end-to-end |
| CI/CD GitHub Actions | ✅ Completo | Workflows para backend, web, mobile |
| Infraestructura AWS (CDK) | 🔴 Skeleton | Solo estructura, sin recursos reales |

---

## Detalle por módulo

### Backend

#### ✅ Core (`backend/app/core/`)
- `config.py` — Pydantic Settings con todas las variables de entorno; incluye parámetros del detector
- `database.py` — Conexión SQLAlchemy async con pool
- `security.py` — JWT: `create_access_token`, `get_current_user` dependency

#### ✅ Modelos de BD (`backend/app/models/`)
- `User` — id, email, hashed_password, created_at
- `Video` — id, user_id, title, filename, s3_key, status (VideoStatus enum), upload_id, s3_parts, error_message, created_at
- `Clip` — id, video_id, s3_key, start_sec, end_sec, team, created_at
- `Exercise` — stub para Fase 3

#### ✅ Migraciones Alembic
- `0001_initial_schema.py` — Tablas base
- `0002_multipart_upload.py` — Columnas de estado multipart en Video
- `0003_add_video_title.py` — Columna title

#### ✅ Routers
- `auth.py` — POST /auth/register, POST /auth/login
- `video.py` — Multipart upload completo + gestión de jobs (lista, estado, retry, delete)
- `clips.py` — GET /clips, GET /clips/{id}, DELETE /clips/{id}
- `ws.py` — WS /ws/{video_id}
- `exercises.py` — Stub Fase 3 (solo estructura)

#### ✅ Servicios
- `storage.py` — S3/MinIO: init_multipart, presigned_parts, complete_multipart, abort, upload_file, presigned_get, delete_file
- `detector.py` — YOLOv8 + OpenCV: detección en espacio LAB, K-means K=2, sliding window majority vote, forward-fill de gaps, progress callbacks
- `cutter.py` — FFmpeg: corte por segmentos, subida a S3
- `queue.py` — Celery tasks: orquesta detector → cutter, actualiza BD, notifica WebSocket

#### ❌ Eliminado
- `validator.py` — Validación con Claude Vision API eliminada del pipeline (decisión tomada en sesión d60cb01)

#### 🔶 Tests (`backend/tests/`)
- ✅ `test_health.py`, `test_startup.py`, `test_multipart_upload.py`, `test_detector.py`, `test_cutter.py`, `test_pipeline.py`
- ❌ Faltan: tests de integración con BD real, tests de WebSocket

---

### Shared (`shared/`)

#### ✅ Tipos
- `video.ts` — `Video`, `VideoStatus`, `ProcessingJob`, `InitUploadRequest/Response`, `UploadedPart`, `PresignedPart`
- `clip.ts` — `Clip`, `ClipMetadata`
- `user.ts` — `User`, `UserRole`
- `auth.ts` — `AuthTokens`, `LoginRequest`, `RegisterRequest`

#### ✅ API client
- `client.ts` — fetch wrapper con Authorization header y manejo de errores
- `auth.ts` — `login()`, `register()`
- `videos.ts` — `initUpload()`, `getUploadStatus()`, `completeUpload()`, `abortUpload()`, `listVideos()`, `getVideoStatus()`, `retryVideo()`, `deleteVideo()`
- `videoUpload.ts` — `uploadVideo()` — cliente multipart completo: progreso por bytes, concurrencia configurable (default 4), reanudación desde localStorage, cancelación
- `clips.ts` — `getClips()`, `getClip()`, `deleteClip()`

---

### Web (`web/`)

#### ✅ Páginas
- `/` (`page.tsx`) — Dashboard / landing con acceso rápido
- `/upload` — Formulario de subida con `VideoUploader`
- `/videos` — Lista de trabajos del usuario con `VideoCard`
- `/videos/[id]` — Detalle: estado del procesado + lista de clips generados
- `/videos/[id]/clips/[clipId]` — Reproductor de clip individual
- `/(auth)/login` y `/(auth)/register` — Formularios de autenticación

#### ✅ Componentes
- `FloatingUploadWidget` — Widget flotante que persiste entre páginas y muestra progreso del upload en curso
- `VideoUploader` — Selección de archivo + título + inicio del proceso multipart
- `VideoCard` — Tarjeta de vídeo en listado (título, estado, nº clips, fecha)
- `ClipCard` — Tarjeta de clip con miniatura y duración
- `ClipPlayer` — Reproductor de vídeo para clips
- `ProcessingStatus` — Badge con estado visual del procesado
- `DeleteVideoDialog` — Confirmación de borrado con aviso de clips asociados
- `Navbar`, `PageShell` — Layout principal

#### ✅ Lib
- `auth.tsx` — Context de autenticación con token en localStorage
- `providers.tsx` — QueryClientProvider + AuthProvider
- `uploadJob.tsx` — Context global del estado del upload en curso
- `queryClient.ts` — React Query con staleTime y retry configurados

---

### Mobile (`mobile/`)

#### 🔶 Scaffolded (estructura creada, lógica pendiente)
- Todas las páginas creadas: index, upload, clips/index, clips/[id], (auth)/login, (auth)/register
- Componentes creados: VideoUploader, ClipPlayer, ClipCard, ProcessingStatus
- Lib: auth, providers, queryClient, theme
- **Pendiente**: conectar componentes a `shared/api`, implementar lógica de subida, reproductor nativo

---

### Infraestructura (`infrastructure/`)

#### 🔴 Solo skeleton
- CDK stack creado con estructura TypeScript
- **Pendiente Fase 1**: sin recursos AWS reales definidos aún

---

## Pendiente — Fase 1

Para considerar Fase 1 completa:

- [ ] **Mobile**: conectar a `shared/api`, implementar upload y reproductor
- [ ] **Tests de integración**: BD real + pipeline end-to-end en entorno Docker
- [ ] **Gestión de errores en web**: retry manual desde la UI cuando el pipeline falla
- [ ] **Modelo YOLO**: evaluar si `yolov8n.pt` es suficiente o necesita modelo finetuneado (ver `backend/models/README.md`)
- [ ] **Infraestructura AWS básica**: al menos ECS, RDS, S3, ElastiCache para staging

---

## Historial de sesiones

### 2026-04-25 — Sesión 5 (mejoras detector de balón)
**Commit**: `7bdcd65` — "Added ball detection improvements"
- Mejoras en `detector.py`: optimizaciones en la detección del balón
- Añadido `backend/.env.example` con variables del detector
- Añadido `backend/models/README.md` — guía para usar modelos YOLO custom o finetuneados
- Añadido docker-compose: configuración adicional de servicios

### 2026-04-25 — Sesión 4 (detector LAB + K-means)
**Commit**: `5eea9c9` — "Added ball detection improvements"
- Reescritura profunda de `detector.py`:
  - Espacio de color LAB en lugar de RGB/HSV
  - K-means (K=2) para separar equipos por color de camiseta
  - Sliding-window majority vote para suavizar ruido
  - Forward-fill de gaps sin balón (con límite MAX_FILL_FRAMES)
  - Progress callbacks para notificar avance via WebSocket
  - Todos los parámetros expuestos via env vars (STRIDE, SMOOTH_WINDOW, etc.)
- Actualizado `config.py` con nuevas variables del detector
- Ampliados `tests/test_detector.py`

### 2026-04-25 — Sesión 3 (UI + upload rápido)
**Commit**: `d60cb01` — "Some ui improvements and faster video upload"
- **Eliminado** `validator.py` (Claude Vision) — simplifica el pipeline
- Añadido `FloatingUploadWidget` — progreso de upload persiste entre navegación
- Nuevas páginas web: `/videos`, `/videos/[id]`, `/videos/[id]/clips/[clipId]`
- Añadido `VideoCard`, `DeleteVideoDialog`
- Eliminada página `/clips` — sustituida por `/videos`
- Mejorado `cutter.py` y `queue.py`
- Añadida migración `0003_add_video_title.py`
- `shared/api/videos.ts` y `shared/types/video.ts` actualizados

### 2026-04-24 — Sesión 2 (multipart upload)
**Commit**: `0f5d12b` — "Improve the video upload. Some minor fixes."
- Implementado multipart upload S3 completo en `storage.py` y `video.py` router
- `shared/api/videoUpload.ts` — cliente multipart con progreso, concurrencia y reanudación
- Migración `0002_multipart_upload.py`
- `tests/test_multipart_upload.py` con 276 líneas de tests
- `scripts/preflight.py` — verificación de entorno al arrancar
- Configuración `docker-compose.yml` ampliada (MinIO, workers)
- Configuración JetBrains Run Configurations (`.run/`)

### 2026-04-24 — Sesión 1 (inicial + fixes)
**Commits**: `434fa5e` (initial commit) + `c8b9753` (some fixes)
- Estructura base del monorepo
- Backend: modelos, routers, servicios, auth, Alembic
- Web: Next.js 14 setup, componentes base, auth
- Mobile: estructura y scaffolding
- Shared: tipos y cliente API base
- CI/CD GitHub Actions workflows
- Migración `0001_initial_schema.py`
- `tests/test_startup.py`
