# Plataforma de Gestión de Clubs de Baloncesto — Instrucciones para Claude

## Documentos de referencia — leer en este orden al inicio de cada sesión

| Documento | Contenido | Cuándo cambia |
|---|---|---|
| `CLAUDE.md` | Arquitectura, stack, decisiones técnicas, reglas de trabajo | Cuando cambia arquitectura o decisiones técnicas |
| `REQUIREMENTS.md` | Modelo de dominio, actores, reglas de negocio, requisitos RF/RN/RD | Cuando se define o cambia funcionalidad |
| `PROGRESS.md` | Estado actual de implementación, roadmap, historial de sesiones | Al finalizar cada sesión |

**Si hay discrepancia entre estos documentos y el código, `REQUIREMENTS.md` es la fuente de verdad del dominio y `CLAUDE.md` es la fuente de verdad técnica.**

---

## Cómo trabajar con Claude en este proyecto

### Al inicio de cada sesión
1. **Lee `CLAUDE.md`** (este archivo) — arquitectura y reglas técnicas.
2. **Lee `PROGRESS.md`** — qué está hecho, qué está en curso, qué es lo próximo.
3. Si el usuario pide algo que afecta al dominio, consulta `REQUIREMENTS.md` para los requisitos específicos.
4. Si el cambio afecta a múltiples capas, identifica todos los archivos implicados antes de empezar (backend → shared → web/mobile).

### Al finalizar cada sesión
1. **Actualiza `PROGRESS.md`**: marca lo completado, actualiza lo pendiente, añade entrada al historial.
2. **Actualiza `CLAUDE.md`** si cambiaste la arquitectura, añadiste dependencias o tomaste decisiones técnicas nuevas.
3. Si añades un endpoint nuevo: actualiza la tabla de API REST de este archivo.
4. Si cambias la estructura de archivos: actualiza las secciones de estructura.

### Reglas de coordinación entre capas
- Backend nuevo endpoint → actualizar `shared/api/` y `shared/types/` siempre.
- Cambio en modelo de BD → crear migración Alembic, nunca modificar tablas a mano.
- Nuevo componente web → verificar si tiene equivalente en mobile.
- Cambio en dominio → actualizar `REQUIREMENTS.md` primero, código después.

---

## ¿Qué es este proyecto?

Plataforma integral de gestión de clubs de baloncesto. Permite a clubs organizar
equipos, temporadas y jugadores; a los técnicos crear y compartir ejercicios y
jugadas con un editor de canvas interactivo; y al staff analizar partidos mediante
recorte automático de vídeo.

**El módulo de recorte de vídeo** (lo construido hasta ahora) es una funcionalidad
dentro del contexto de un equipo: un miembro del staff sube un vídeo, el sistema
detecta cambios de posesión y genera clips automáticamente.

### Visión a largo plazo
Similar a Hudl o Catapult pero más accesible, con:
- Gestión completa de clubs, temporadas, equipos y jugadores
- Editor de jugadas/ejercicios con canvas interactivo y árbol de secuencias
- Biblioteca personal + catálogo del club + playbook del equipo
- Análisis de vídeo con recorte automático por posesiones
- Partidos, estadísticas y entrenamientos (fases futuras)

---

## Glosario canónico — usar estos nombres en código, tablas y endpoints

Definición completa en `REQUIREMENTS.md` §1. Términos clave:

| Término (ES) | Término (EN) — usar en código |
|---|---|
| Club | `Club` |
| Director técnico | `TechnicalDirector` |
| Entrenador | `HeadCoach` |
| Cuerpo técnico | `StaffMember` |
| Jugador | `Player` (no es usuario del sistema) |
| Equipo | `Team` |
| Temporada | `Season` |
| Perfil | `Profile` |
| Miembro de club | `ClubMember` |
| Ejercicio | `Drill` |
| Jugada | `Play` |
| Variante | `Variant` |
| Nodo de secuencia | `SequenceNode` |
| Catálogo del club | `ClubCatalog` |
| Biblioteca personal | `PersonalLibrary` |
| Playbook del equipo | `TeamPlaybookEntry` |

---

## Decisiones de arquitectura

### Autenticación y perfil activo — JWT con `profile_id` como claim
El usuario puede tener múltiples perfiles (combinación de Club + Equipo/nivel + Rol + Temporada).
El perfil activo viaja como claim `profile_id` dentro del JWT firmado, no como header separado.

**Por qué**: el perfil está criptográficamente vinculado a la identidad del usuario.
El backend valida token como unidad atómica — no necesita verificar en cada request
si ese `profile_id` pertenece al usuario. Elimina una clase entera de vulnerabilidades
que aparecen con `X-Profile-Id` como header independiente.

**Flujo**: al cambiar de perfil en el selector, el frontend hace POST silencioso,
recibe nuevo JWT con `profile_id` actualizado, reemplaza el token y redirige.

### Monorepo — todos los stacks en el mismo repositorio
Claude necesita ver backend, frontend y tipos compartidos en la misma sesión para
hacer cambios coordinados correctamente. El contrato de API y el cliente que lo
consume deben estar siempre en el mismo contexto.

### Por qué multipart upload directo a S3 desde el browser
El backend nunca recibe los bytes del vídeo. El browser sube directamente a S3
con URLs pre-firmadas en paralelo (4 partes simultáneas). El backend solo coordina:
crea el multipart, devuelve las URLs, y cierra el upload. Evita que FastAPI sea
cuello de botella y permite reanudar uploads interrumpidos.

### Por qué LAB en lugar de RGB/HSV para detectar equipos
El espacio LAB separa luminancia (L) de crominancia (a, b). Dos jerseys del mismo
color bajo distinta iluminación tienen L diferente pero a,b similares. K-means
sobre LAB da centroides de equipo más robustos.

### Por qué se eliminó el validador de Claude Vision
Añadía latencia sin aportar valor en un entorno controlado. Se puede reintroducir
en fases posteriores como moderación asíncrona.

### Por qué PostgreSQL ahora y Aurora después
Aurora Serverless v2 es 100% compatible con PostgreSQL. Migración = cambiar
`DATABASE_URL`. El código ORM no cambia.

### Árbol de secuencias — JSON serializado en PostgreSQL
Los `SequenceNode` de jugadas/ejercicios se almacenan como JSON en la columna
de la entidad padre, no como tabla relacional recursiva. Se leen y escriben
siempre completos. Si el volumen lo requiere, se puede migrar a tabla relacional
sin cambiar la API.

---

## Stack tecnológico

### Backend — `backend/`
| Tecnología | Uso |
|---|---|
| Python 3.11 | Lenguaje principal |
| FastAPI | API REST + WebSockets |
| YOLOv8 (Ultralytics) | Detección de jugadores y pelota |
| OpenCV | Análisis de frames y colores de camisetas (espacio LAB + K-means) |
| FFmpeg (ffmpeg-python) | Corte de vídeos |
| SQLAlchemy 2.0 | ORM (async) |
| Alembic | Migraciones de base de datos |
| Pydantic v2 | Schemas de request/response |
| Celery + Redis | Cola de tareas para procesado de vídeo |

### Web — `web/`
| Tecnología | Uso |
|---|---|
| Next.js 14 (App Router) | Framework web |
| TypeScript | Lenguaje |
| Tailwind CSS | Estilos |
| shadcn/ui | Componentes de UI |
| React Query | Fetching y caché de datos |

### Mobile — `mobile/`
| Tecnología | Uso |
|---|---|
| React Native + Expo | Framework móvil (iOS + Android) |
| TypeScript | Lenguaje |
| Expo Router | Navegación |
| React Query | Fetching y caché de datos |

### Base de datos
- **Desarrollo local**: PostgreSQL 16 via Docker
- **Producción fase A-D**: Amazon RDS PostgreSQL
- **Producción fase E+**: Amazon Aurora Serverless v2 (compatible con PostgreSQL)

### Infraestructura AWS (producción)
| Servicio | Rol |
|---|---|
| CloudFront | CDN para assets y clips |
| S3 | Almacenamiento de vídeos y clips |
| ALB | Load balancer HTTPS |
| ECS Fargate | Backend FastAPI containerizado |
| EC2 g4dn | Workers GPU para YOLOv8 + FFmpeg |
| SQS | Cola de jobs de procesado de vídeo |
| ElastiCache Redis | Caché y pub/sub para WebSockets |
| RDS / Aurora | Base de datos PostgreSQL |
| Cognito | Autenticación (futuro — actualmente JWT propio) |
| Secrets Manager | API keys y credenciales |
| CloudWatch | Logs, métricas y alertas |

---

## Estructura del monorepo

```
basketball-clipper/
├── backend/          Python 3.11 + FastAPI + Celery worker
├── web/              Next.js 14 + TypeScript + Tailwind
├── mobile/           React Native + Expo + TypeScript
├── shared/           Tipos y cliente API compartidos (TypeScript)
├── infrastructure/   AWS CDK (TypeScript)
├── docs/             Documentación técnica
├── docker-compose.yml
├── CLAUDE.md         ← estás aquí — fuente de verdad técnica
├── REQUIREMENTS.md   ← fuente de verdad del dominio y reglas de negocio
└── PROGRESS.md       ← estado actual e historial de sesiones
```

---

## Estructura detallada del backend

```
backend/
├── app/
│   ├── main.py               # Entrada FastAPI, routers registrados aquí
│   ├── core/
│   │   ├── config.py         # Variables de entorno (Pydantic Settings) — ÚNICA fuente
│   │   ├── database.py       # Conexión SQLAlchemy async
│   │   └── security.py       # JWT, get_current_user dependency
│   ├── routers/
│   │   ├── video.py          # Multipart upload lifecycle + gestión de jobs
│   │   ├── clips.py          # GET /clips, GET /clips/{id}, DELETE /clips/{id}
│   │   ├── exercises.py      # Stub — no implementado aún
│   │   ├── auth.py           # Login, registro, refresh token
│   │   └── ws.py             # WebSocket /ws/{video_id}
│   ├── services/
│   │   ├── detector.py       # YOLOv8 + OpenCV — detección de posesión (LAB + K-means)
│   │   ├── cutter.py         # FFmpeg — corte de clips
│   │   ├── storage.py        # S3/MinIO — upload/download/presigned URLs
│   │   └── queue.py          # Celery tasks — orquestación del pipeline
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py           # User
│   │   ├── video.py          # Video (con VideoStatus enum)
│   │   ├── clip.py           # Clip
│   │   └── exercise.py       # Exercise (stub)
│   └── schemas/
│       ├── auth.py
│       ├── video.py          # InitUpload, CompleteUpload, etc.
│       └── clip.py
├── alembic/versions/
│   ├── 0001_initial_schema.py
│   ├── 0002_multipart_upload.py
│   └── 0003_add_video_title.py
├── models/
│   └── README.md             # Cómo usar modelos custom de YOLO
├── scripts/
│   └── preflight.py          # Verifica BD, Redis y S3 al arrancar
├── tests/
├── yolov8n.pt                # Excluido de git — descarga local
├── Dockerfile
├── requirements.txt
└── .env.example
```

### Reglas del backend
- Lógica de negocio SIEMPRE en `services/`, nunca en `routers/`
- Los routers solo validan input, llaman al servicio y devuelven respuesta
- Usa `async/await` en todo — FastAPI y SQLAlchemy son async
- Variables de entorno SOLO desde `core/config.py`
- Nunca hardcodees credenciales, URLs ni API keys
- Pesos `.pt` de YOLO no van al repo

---

## Estructura detallada del frontend web

```
web/
├── app/
│   ├── layout.tsx            # Layout raíz — incluye FloatingUploadWidget global
│   ├── page.tsx              # Dashboard / landing
│   ├── upload/page.tsx       # Página de subida de vídeo
│   ├── videos/
│   │   ├── page.tsx          # Lista de vídeos del usuario
│   │   └── [id]/
│   │       ├── page.tsx      # Detalle: progreso + clips generados
│   │       └── clips/[clipId]/page.tsx
│   └── (auth)/
│       ├── login/page.tsx
│       └── register/page.tsx
├── components/
│   ├── ui/                   # shadcn/ui
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── PageShell.tsx
│   └── video/
│       ├── VideoUploader.tsx
│       ├── FloatingUploadWidget.tsx
│       ├── VideoCard.tsx
│       ├── ClipCard.tsx
│       ├── ClipPlayer.tsx
│       ├── ProcessingStatus.tsx
│       └── DeleteVideoDialog.tsx
├── lib/
│   ├── auth.tsx
│   ├── providers.tsx
│   ├── queryClient.ts
│   ├── uploadJob.tsx
│   └── utils.ts
├── Dockerfile
├── package.json
└── .env.example
```

### Reglas del frontend web
- App Router siempre — nunca `pages/`
- Server Components por defecto; `"use client"` solo para hooks/eventos
- Todas las llamadas a la API via `shared/api/` — nunca `fetch()` directo
- Clases de Tailwind — no crear archivos CSS propios
- Ruta de vídeos: `/videos/` (no `/clips/`)

---

## Shared — tipos y API compartidos

```
shared/
├── types/
│   ├── video.ts, clip.ts, user.ts, auth.ts, index.ts
└── api/
    ├── client.ts, auth.ts, videos.ts, videoUpload.ts, clips.ts, index.ts
```

**Regla**: al añadir un endpoint nuevo, añadir su función en `shared/api/`
y sus tipos en `shared/types/`. Web y mobile nunca llaman al backend directamente.

---

## Pipeline de recorte de vídeo (módulo actual)

```
1. Usuario sube vídeo (browser → S3 directo, multipart)
   POST /videos/init-upload → crea Video en BD + inicia multipart en S3
   Browser PUT a URLs pre-firmadas → sube partes en paralelo (4 concurrent)
   POST /videos/{id}/complete-upload → cierra multipart, encola en Celery

2. Worker Celery (queue.py)
   → Notifica progreso via WebSocket en cada fase

3. detector.py: YOLOv8 frame a frame
   → LAB color space + K-means (K=2) para separar equipos
   → Jugador más cercano al balón → equipo con posesión
   → Forward-fill gaps cortos, sliding-window majority vote
   → Genera: [(start_sec, end_sec, team), ...]

4. cutter.py: FFmpeg corta los clips
   → Sube cada clip a S3 + crea registros Clip en BD

5. WebSocket notifica status="completed" o status="error"
```

### Parámetros del detector (env vars)
| Variable | Default | Descripción |
|---|---|---|
| `DETECTOR_STRIDE` | 5 | Analizar 1 de cada N frames |
| `DETECTOR_SMOOTH_WINDOW` | 7 | Frames para majority vote |
| `DETECTOR_MIN_SEGMENT_SEC` | 3.0 | Duración mínima de un segmento |
| `DETECTOR_MAX_FILL_FRAMES` | 30 | Máximo frames a interpolar sin balón |
| `DETECTOR_YOLO_MODEL` | `yolov8n.pt` | Ruta al modelo YOLO |

---

## API REST — endpoints actuales

| Método | Endpoint | Descripción |
|---|---|---|
| POST | /auth/register | Registro |
| POST | /auth/login | Login → JWT |
| POST | /videos/init-upload | Inicia multipart: crea Video + presigned URLs |
| GET | /videos/{id}/upload-status | Partes subidas (reanudar) |
| POST | /videos/{id}/complete-upload | Cierra multipart, encola pipeline |
| POST | /videos/{id}/abort-upload | Aborta upload, limpia S3 |
| GET | /videos | Lista vídeos del usuario |
| GET | /videos/{id}/status | Estado del procesado |
| POST | /videos/{id}/retry | Re-encola si está en error |
| DELETE | /videos/{id} | Borra vídeo + clips + S3 |
| GET | /clips | Lista clips del usuario |
| GET | /clips/{id} | Detalle de clip |
| DELETE | /clips/{id} | Eliminar clip |
| WS | /ws/{video_id} | Progreso en tiempo real |

---

## Roadmap de fases

| Fase | Descripción | Estado |
|---|---|---|
| **A** | Estructura organizativa + auth multi-perfil | 🔴 No iniciado |
| **B** | Módulo de vídeo integrado en equipos | 🔶 Base construida (standalone) |
| **C** | Gestión de jugadores | 🔴 No iniciado |
| **D** | Editor de jugadas/ejercicios (sketch + árbol) | 🔴 No iniciado |
| **E** | Catálogo del club + TeamPlaybook | 🔴 No iniciado |
| **F** | Partidos, estadísticas, entrenamientos | 🔴 No iniciado |

Consulta `PROGRESS.md` para el detalle de cada fase y su estado.
**No implementes funcionalidades de fases posteriores hasta que la fase activa esté sólida.**

---

## Desarrollo local

```bash
# Todo el entorno
docker-compose up
# Levanta: FastAPI (8000), Celery worker, PostgreSQL (5432), Redis (6379), MinIO (9000/9001)

# Solo backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Solo web
cd web && npm install && npm run dev   # http://localhost:3000

# Solo mobile
cd mobile && npm install && npx expo start

# Verificar entorno
cd backend && python scripts/preflight.py

# Migraciones
cd backend && alembic revision --autogenerate -m "descripcion"
cd backend && alembic upgrade head

# Tests
cd backend && pytest -v
```

**Nunca commitees archivos `.env`**

---

## Lo que NO hacer

- No pongas lógica de negocio en los routers — va en `services/`
- No llames a la API directamente desde componentes — usa `shared/api/`
- No uses `pages/` en Next.js — usa `app/` (App Router)
- No hardcodees credenciales ni URLs
- No modifiques tablas de BD a mano — siempre migraciones Alembic
- No implementes fases posteriores hasta que la fase activa esté sólida
- No uses el glosario en español en el código — usa los términos canónicos en inglés de `REQUIREMENTS.md` §1
- No uses la ruta `/clips` en el frontend — la navegación es `/videos`
