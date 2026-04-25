# Basketball Clipper — Instrucciones para Claude

## Cómo trabajar con Claude en este proyecto

Este proyecto se gestiona íntegramente con Claude (Cowork + Claude Code).
Para que cada sesión funcione bien y el proyecto evolucione sin fricciones:

### Al inicio de cada sesión
1. **Lee este archivo primero** — es la fuente de verdad sobre arquitectura y reglas.
2. **Lee `PROGRESS.md`** — refleja qué está hecho, qué está en curso y qué queda.
3. Si el usuario pide un cambio que afecta a múltiples capas, identifica todos los
   archivos implicados antes de empezar (backend → shared → web/mobile).

### Al finalizar cada sesión
1. **Actualiza `PROGRESS.md`**: marca lo completado, añade lo nuevo pendiente,
   registra la sesión con fecha y resumen breve.
2. **Actualiza este archivo** si cambias la arquitectura, añades dependencias,
   o tomas decisiones que afecten cómo Claude debe trabajar en el futuro.
3. Si añades un endpoint nuevo: actualiza la tabla de API REST de este archivo.
4. Si cambias la estructura de archivos: actualiza las secciones de estructura.

### Reglas de coordinación entre capas
- Backend nuevo endpoint → actualizar `shared/api/` y `shared/types/` siempre.
- Cambio en modelo de BD → crear migración Alembic, no modificar tablas a mano.
- Nuevo componente web → verificar que existe su equivalente en mobile si aplica.

---

## ¿Qué es este proyecto?

Plataforma para recorte automático de vídeos de baloncesto. El sistema:
1. Recibe el vídeo subido directamente a S3 desde el browser (multipart upload)
2. Detecta cambios de posesión entre equipos (YOLOv8 + OpenCV, espacio LAB)
3. Corta automáticamente un clip por cada posesión (FFmpeg)
4. Permite ver, organizar y reproducir clips en la web (fases futuras: etiquetar, compartir)

El objetivo a largo plazo es convertirse en una plataforma completa de análisis
táctico para entrenadores y equipos, similar a Hudl o Catapult pero más accesible.

---

## Estructura del monorepo

```
basketball-clipper/
├── backend/          Python 3.11 + FastAPI + Celery worker
├── web/              Next.js 14 + TypeScript + Tailwind
├── mobile/           React Native + Expo + TypeScript
├── shared/           Tipos y cliente API compartidos (TypeScript)
├── infrastructure/   AWS CDK (TypeScript)
├── docs/             Documentación técnica y decisiones de arquitectura
├── docker-compose.yml
├── CLAUDE.md         ← estás aquí (fuente de verdad de arquitectura)
└── PROGRESS.md       ← estado actual de implementación (leer al inicio)
```

Cada stack es independiente pero comparten el contrato de tipos de `shared/`.
Cuando hagas cambios en la API del backend, actualiza siempre `shared/` también.

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

> **Nota**: La validación con Claude Vision API fue eliminada del pipeline en
> favor de agilidad. El vídeo se procesa directamente sin verificación previa.

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
- **Producción fase 1-4**: Amazon RDS PostgreSQL
- **Producción fase 5+**: Amazon Aurora Serverless v2 (compatible con PostgreSQL)
- La cadena de conexión es la única diferencia entre entornos — el código no cambia

### Infraestructura AWS (producción)
| Servicio AWS | Rol |
|---|---|
| CloudFront | CDN para assets y clips |
| S3 | Almacenamiento de vídeos y clips |
| ALB | Load balancer HTTPS |
| ECS Fargate | Backend FastAPI containerizado |
| EC2 g4dn | Workers GPU para YOLOv8 + FFmpeg |
| SQS | Cola de jobs de procesado de vídeo |
| ElastiCache Redis | Caché y pub/sub para WebSockets |
| RDS / Aurora | Base de datos PostgreSQL |
| Cognito | Autenticación y gestión de usuarios |
| Secrets Manager | API keys y credenciales |
| CloudWatch | Logs, métricas y alertas |

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
│   │   ├── exercises.py      # Stub fase 3 — no implementado aún
│   │   ├── auth.py           # Login, registro, refresh token
│   │   └── ws.py             # WebSocket /ws/{video_id} — progreso en tiempo real
│   ├── services/
│   │   ├── detector.py       # YOLOv8 + OpenCV — detección de posesión (LAB + K-means)
│   │   ├── cutter.py         # FFmpeg — corte de clips
│   │   ├── storage.py        # S3/MinIO — upload/download/presigned URLs
│   │   └── queue.py          # Celery tasks — orquestación del pipeline
│   ├── models/
│   │   ├── __init__.py       # Importa todos los modelos (necesario para Alembic)
│   │   ├── user.py           # SQLAlchemy model User
│   │   ├── video.py          # SQLAlchemy model Video (con VideoStatus enum)
│   │   ├── clip.py           # SQLAlchemy model Clip
│   │   └── exercise.py       # SQLAlchemy model Exercise (fase 3)
│   └── schemas/
│       ├── auth.py           # Pydantic schemas para auth
│       ├── video.py          # Schemas upload: InitUpload, CompleteUpload, etc.
│       └── clip.py           # Pydantic schemas para Clip
├── alembic/
│   └── versions/
│       ├── 0001_initial_schema.py    # Tablas base: users, videos, clips
│       ├── 0002_multipart_upload.py  # Columnas S3 multipart (upload_id, parts, etc.)
│       └── 0003_add_video_title.py   # Columna title en Video
├── models/
│   └── README.md             # Cómo usar modelos custom de YOLO (pesos .pt)
├── scripts/
│   └── preflight.py          # Verifica conexiones al arrancar (BD, Redis, S3)
├── tests/
│   ├── conftest.py
│   ├── test_health.py
│   ├── test_detector.py
│   ├── test_multipart_upload.py
│   ├── test_pipeline.py
│   ├── test_cutter.py
│   └── test_startup.py
├── yolov8n.pt                # Pesos YOLOv8n (excluido de git, descarga local)
├── Dockerfile
├── requirements.txt
└── .env.example
```

### Reglas del backend
- La lógica de negocio va SIEMPRE en `services/`, nunca en `routers/`
- Los routers solo validan input, llaman al servicio y devuelven la respuesta
- Usa `async/await` en todo — FastAPI y SQLAlchemy son async
- Las variables de entorno se cargan SOLO desde `core/config.py`
- Nunca hardcodees credenciales, URLs ni API keys en el código
- Los pesos `.pt` de YOLO no van al repo — cada dev los descarga (ver `models/README.md`)

---

## Estructura detallada del frontend web

```
web/
├── app/
│   ├── layout.tsx            # Layout raíz — incluye FloatingUploadWidget global
│   ├── page.tsx              # Dashboard / landing
│   ├── upload/
│   │   └── page.tsx          # Página de subida de vídeo
│   ├── videos/
│   │   ├── page.tsx          # Lista de trabajos/vídeos del usuario
│   │   └── [id]/
│   │       ├── page.tsx      # Detalle de un vídeo: progreso + clips generados
│   │       └── clips/
│   │           └── [clipId]/
│   │               └── page.tsx  # Reproductor de clip individual
│   └── (auth)/
│       ├── layout.tsx
│       ├── login/page.tsx
│       └── register/page.tsx
├── components/
│   ├── ui/                   # Componentes shadcn/ui (button, card, badge, etc.)
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── PageShell.tsx
│   └── video/
│       ├── VideoUploader.tsx         # Formulario de selección + inicio de upload
│       ├── FloatingUploadWidget.tsx  # Widget flotante con progreso (persiste entre páginas)
│       ├── VideoCard.tsx             # Tarjeta de vídeo en el listado
│       ├── ClipCard.tsx              # Tarjeta de clip
│       ├── ClipPlayer.tsx            # Reproductor de clip
│       ├── ProcessingStatus.tsx      # Badge de estado del procesado
│       └── DeleteVideoDialog.tsx     # Diálogo de confirmación de borrado
├── lib/
│   ├── auth.tsx              # Context de autenticación
│   ├── providers.tsx         # QueryClientProvider + AuthProvider
│   ├── queryClient.ts        # React Query config
│   ├── uploadJob.tsx         # Estado global del upload en curso (context)
│   └── utils.ts              # Utilidades (cn, etc.)
├── Dockerfile
├── package.json
└── .env.example
```

### Reglas del frontend web
- Usa App Router siempre — nunca el directorio `pages/`
- Los componentes son Server Components por defecto
- Añade `"use client"` solo cuando necesites hooks o eventos del browser
- Todas las llamadas a la API van a través de `shared/api/` — nunca `fetch()` directo
- Usa clases de Tailwind — no crees archivos CSS propios
- La ruta de vídeos es `/videos/` (no `/clips/` — esa ruta ya no existe)

---

## Estructura del mobile

```
mobile/
├── app/
│   ├── _layout.tsx           # Layout raíz con Expo Router + Providers
│   ├── index.tsx             # Dashboard
│   ├── upload.tsx            # Subir vídeo
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── clips/
│       ├── index.tsx         # Lista de clips
│       └── [id].tsx          # Detalle de clip
├── components/
│   ├── VideoUploader.tsx
│   ├── ClipPlayer.tsx
│   ├── ClipCard.tsx
│   └── ProcessingStatus.tsx
└── lib/
    ├── auth.tsx
    ├── providers.tsx
    ├── queryClient.ts
    └── theme.ts
```

### Reglas del mobile
- Reutiliza `shared/types` y `shared/api` igual que el web
- Intenta que los nombres de componentes sean iguales a los del web
- Usa Expo SDK — no instales dependencias nativas sin necesidad

---

## Shared — tipos y API compartidos

```
shared/
├── types/
│   ├── video.ts              # Video, VideoStatus, ProcessingJob, multipart types
│   ├── clip.ts               # Clip, ClipMetadata
│   ├── user.ts               # User, UserRole
│   ├── auth.ts               # AuthTokens, LoginRequest, RegisterRequest
│   └── index.ts              # Re-exports
└── api/
    ├── client.ts             # fetch wrapper con auth headers
    ├── auth.ts               # login(), register(), refresh()
    ├── videos.ts             # initUpload(), completeUpload(), getVideoStatus(), etc.
    ├── videoUpload.ts        # uploadVideo() — cliente multipart completo con progreso/reanudación
    ├── clips.ts              # getClips(), getClip(), deleteClip()
    └── index.ts              # Re-exports
```

**Regla importante**: cuando añadas un endpoint nuevo al backend, añade
siempre su función correspondiente en `shared/api/` y sus tipos en `shared/types/`.
Web y mobile nunca llaman al backend directamente — siempre a través de shared.

---

## Pipeline de procesado de vídeo

Este es el flujo más crítico de la aplicación:

```
1. Usuario sube vídeo (desde el browser, directo a S3)
   → POST /videos/init-upload         → crea Video en BD + inicia multipart en S3
   → Browser PUT a URLs pre-firmadas  → sube partes en paralelo (4 concurrent)
   → POST /videos/{id}/complete-upload → cierra multipart, encola pipeline en Celery

2. Worker Celery recibe job
   → queue.py orquesta el pipeline completo
   → Notifica progreso via WebSocket en cada fase

3. detector.py: YOLOv8 analiza frame a frame
   → Sample cada STRIDE-ésimo frame (configurable via env)
   → Detecta jugadores (cls 0) y balón (cls 32)
   → Convierte jerseys a espacio LAB — separa crominancia de luminancia
   → K-means (K=2) sobre valores LAB — obtiene dos centroides de equipo
   → Determina posesión: jugador más cercano al balón → su equipo
   → Forward-fill gaps cortos (MAX_FILL_FRAMES), rompe segmento en gaps largos
   → Sliding-window majority vote para suavizar ruido
   → Genera lista de segmentos: [(start_sec, end_sec, team), ...]

4. cutter.py: FFmpeg corta los clips
   → Un clip por cada segmento de posesión
   → Los sube a S3
   → Crea registros Clip en BD

5. WebSocket notifica al cliente en tiempo real
   → status="completed" cuando todos los clips están listos
   → status="error" si el pipeline falla (con mensaje de error)
```

### Parámetros del detector (configurables via env)
| Variable | Por defecto | Descripción |
|---|---|---|
| `DETECTOR_STRIDE` | 5 | Analizar 1 de cada N frames |
| `DETECTOR_SMOOTH_WINDOW` | 7 | Frames para majority vote |
| `DETECTOR_MIN_SEGMENT_SEC` | 3.0 | Duración mínima de un segmento |
| `DETECTOR_MAX_FILL_FRAMES` | 30 | Máximo de frames a interpolar si no se detecta balón |
| `DETECTOR_YOLO_MODEL` | `yolov8n.pt` | Ruta al modelo YOLO (relativa al worker) |

---

## API REST — endpoints principales

| Método | Endpoint | Descripción |
|---|---|---|
| POST | /auth/register | Registro de usuario |
| POST | /auth/login | Login, devuelve JWT |
| POST | /videos/init-upload | Inicia multipart upload: crea Video + presigned URLs |
| GET | /videos/{id}/upload-status | Partes ya subidas (para reanudar uploads) |
| POST | /videos/{id}/complete-upload | Cierra multipart, encola pipeline |
| POST | /videos/{id}/abort-upload | Aborta upload, limpia S3 |
| GET | /videos | Lista trabajos del usuario (con nº de clips) |
| GET | /videos/{id}/status | Estado del procesado |
| POST | /videos/{id}/retry | Re-encola pipeline si está en error |
| DELETE | /videos/{id} | Borra vídeo + clips + archivos S3 |
| GET | /clips | Lista clips del usuario |
| GET | /clips/{id} | Detalle de un clip |
| DELETE | /clips/{id} | Eliminar clip |
| WS | /ws/{video_id} | Progreso en tiempo real |

---

## Desarrollo local

### Requisitos
- Docker Desktop
- Python 3.11+
- Node.js 20+
- Expo CLI (`npm install -g expo-cli`)

### Arrancar todo el entorno
```bash
docker-compose up
```
Esto levanta: FastAPI (8000), Celery worker, PostgreSQL (5432), Redis (6379), MinIO (9000/9001)

### Solo backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Solo web
```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

### Solo mobile
```bash
cd mobile
npm install
npx expo start
```

### Variables de entorno
Copia `.env.example` a `.env` en cada stack:
```bash
cp backend/.env.example backend/.env
```
**Nunca commitees archivos `.env`**

### Verificación de entorno
```bash
cd backend && python scripts/preflight.py
```
Verifica que BD, Redis y S3 están accesibles antes de arrancar.

---

## Fases del producto

| Fase | Funcionalidades | Estado |
|---|---|---|
| 1 | Upload multipart, detección posesión, corte de clips, web básica | **En curso** (~75%) |
| 2 | Biblioteca de clips, etiquetado automático (contraataque, pick & roll...) | Planificado |
| 3 | Creador de ejercicios, anotaciones sobre vídeo | Planificado |
| 4 | Perfiles de equipo, compartir ejercicios, roles (entrenador/jugador) | Planificado |
| 5 | Análisis táctico con IA, estadísticas, migración a Aurora Serverless v2 | Futuro |

Consulta `PROGRESS.md` para el detalle de qué está implementado dentro de cada fase.
**No implementes funcionalidades de fases 2-5 hasta que la fase 1 esté sólida.**

---

## Decisiones de arquitectura (ADRs)

### Por qué multipart upload directo a S3 desde el browser
El backend nunca recibe los bytes del vídeo. El browser sube directamente a S3
con URLs pre-firmadas en paralelo (4 partes simultáneas). El backend solo coordina:
crea el multipart, devuelve las URLs, y cierra el upload. Esto evita que FastAPI
sea el cuello de botella para archivos grandes y permite reanudar uploads interrumpidos.

### Por qué LAB en lugar de RGB/HSV para detectar equipos
El espacio de color LAB separa luminancia (L) de crominancia (a, b). Dos jerseys
del mismo color bajo distinta iluminación tienen L diferente pero a,b similares.
K-means sobre LAB da centroides de equipo más robustos que RGB o HSV.

### Por qué se eliminó el validador de Claude Vision
La validación previa añadía latencia (llamada a la API externa) y bloqueaba el
pipeline sin aportar valor real en un entorno controlado donde el usuario sabe
lo que está subiendo. Se puede reintroducir en fases posteriores como
moderación asíncrona si se necesita.

### Por qué monorepo
Claude necesita contexto completo para hacer cambios coordinados entre backend
y frontend. Con un monorepo puede ver el contrato de la API y el cliente que
la consume en la misma sesión.

### Por qué PostgreSQL ahora y Aurora después
Aurora Serverless v2 es compatible 100% con PostgreSQL. La migración es
cambiar la variable DATABASE_URL — el código ORM no cambia.

### Por qué SQS + EC2 GPU para el procesado (producción)
El procesado de vídeo con YOLOv8 necesita GPU y puede tardar minutos.
En desarrollo se usa Celery con Redis directamente; en producción SQS + EC2 g4dn.

---

## Comandos útiles

```bash
# Crear migración de BD
cd backend && alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
cd backend && alembic upgrade head

# Correr tests backend
cd backend && pytest

# Correr tests con output detallado
cd backend && pytest -v

# Build de producción web
cd web && npm run build

# Verificar entorno local antes de arrancar
cd backend && python scripts/preflight.py
```

---

## Lo que NO hacer

- No pongas lógica de negocio en los routers del backend
- No llames a la API directamente desde componentes — usa `shared/api/`
- No uses el directorio `pages/` en Next.js — usa `app/` (App Router)
- No hardcodees credenciales ni URLs
- No commitees archivos `.env`
- No instales dependencias de GPU en el contenedor principal de FastAPI —
  el procesado pesado va en los workers de Celery
- No implementes funcionalidades de fases 2-5 hasta que la fase 1 esté sólida
- No modifiques tablas de BD a mano — siempre usa migraciones Alembic
- No uses la ruta `/clips` en el frontend — la navegación principal es `/videos`
