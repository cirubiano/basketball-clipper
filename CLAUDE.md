# Basketball Clipper — Claude Code Instructions

## ¿Qué es este proyecto?

Plataforma para recorte automático de vídeos de baloncesto. El sistema:
1. Valida que el vídeo subido es un partido de baloncesto (Claude Vision API)
2. Detecta cambios de posesión entre equipos (YOLOv8 + OpenCV)
3. Corta automáticamente un clip por cada posesión (FFmpeg)
4. Permite organizar, etiquetar y compartir clips (fases futuras)

El objetivo a largo plazo es convertirse en una plataforma completa de análisis
táctico para entrenadores y equipos, similar a Hudl o Catapult pero más accesible.

---

## Estructura del monorepo

```
basketball-clipper/
├── backend/          Python 3.11 + FastAPI
├── web/              Next.js 14 + TypeScript + Tailwind
├── mobile/           React Native + Expo + TypeScript
├── shared/           Tipos y cliente API compartidos (TypeScript)
├── infrastructure/   AWS CDK (TypeScript)
├── docs/             Documentación técnica y decisiones de arquitectura
├── docker-compose.yml
└── CLAUDE.md         ← estás aquí
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
| OpenCV | Análisis de frames y colores de camisetas |
| FFmpeg (ffmpeg-python) | Corte de vídeos |
| Claude API (Vision) | Validación de que el vídeo es baloncesto |
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
│   │   ├── config.py         # Variables de entorno (Pydantic Settings)
│   │   ├── database.py       # Conexión SQLAlchemy async
│   │   └── security.py       # JWT, autenticación
│   ├── routers/
│   │   ├── video.py          # POST /videos/upload, GET /videos/{id}/status
│   │   ├── clips.py          # GET /clips, GET /clips/{id}, DELETE /clips/{id}
│   │   ├── exercises.py      # CRUD ejercicios (fase 3)
│   │   └── auth.py           # Login, registro, refresh token
│   ├── services/
│   │   ├── validator.py      # Validación con Claude Vision API
│   │   ├── detector.py       # YOLOv8 + OpenCV — detección de posesión
│   │   ├── cutter.py         # FFmpeg — corte de clips
│   │   ├── storage.py        # S3 upload/download
│   │   └── queue.py          # Celery tasks — orquestación del pipeline
│   ├── models/
│   │   ├── user.py           # SQLAlchemy model User
│   │   ├── video.py          # SQLAlchemy model Video
│   │   ├── clip.py           # SQLAlchemy model Clip
│   │   └── exercise.py       # SQLAlchemy model Exercise (fase 3)
│   └── schemas/
│       ├── video.py          # Pydantic schemas para Video
│       └── clip.py           # Pydantic schemas para Clip
├── alembic/                  # Migraciones de base de datos
├── tests/
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

---

## Estructura detallada del frontend web

```
web/
├── app/
│   ├── layout.tsx            # Layout raíz
│   ├── page.tsx              # Landing / dashboard
│   ├── upload/
│   │   └── page.tsx          # Subir vídeo
│   ├── clips/
│   │   ├── page.tsx          # Lista de clips
│   │   └── [id]/page.tsx     # Detalle de clip
│   └── (auth)/
│       ├── login/page.tsx
│       └── register/page.tsx
├── components/
│   ├── ui/                   # Componentes shadcn/ui
│   └── video/
│       ├── VideoUploader.tsx
│       ├── ClipPlayer.tsx
│       └── ProcessingStatus.tsx
├── lib/
│   └── queryClient.ts        # React Query config
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

---

## Estructura del mobile

```
mobile/
├── app/
│   ├── _layout.tsx           # Layout raíz con Expo Router
│   ├── index.tsx             # Dashboard
│   ├── upload.tsx            # Subir vídeo
│   └── clips/
│       ├── index.tsx         # Lista de clips
│       └── [id].tsx          # Detalle de clip
├── components/
│   ├── VideoUploader.tsx
│   └── ClipPlayer.tsx
└── lib/
    └── queryClient.ts
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
│   ├── video.ts              # Video, VideoStatus, ProcessingJob
│   ├── clip.ts               # Clip, ClipMetadata
│   ├── user.ts               # User, UserRole
│   └── index.ts              # Re-exports
└── api/
    ├── client.ts             # fetch wrapper con auth headers
    ├── videos.ts             # uploadVideo(), getVideoStatus()
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
1. Usuario sube vídeo
   → POST /videos/upload
   → Se guarda en S3
   → Se crea registro Video en BD con status="pending"
   → Se encola job en SQS/Celery

2. Worker recibe job
   → validator.py: Claude Vision analiza frames del vídeo
     → Si NO es baloncesto: status="invalid", notifica usuario
     → Si ES baloncesto: continúa

3. detector.py: YOLOv8 analiza frame a frame
   → Detecta jugadores por color de camiseta (dos equipos)
   → Detecta la pelota
   → Determina qué equipo tiene posesión en cada frame
   → Genera lista de segmentos: [(inicio, fin, equipo), ...]

4. cutter.py: FFmpeg corta los clips
   → Un clip por cada segmento de posesión
   → Los sube a S3
   → Crea registros Clip en BD

5. WebSocket notifica al cliente
   → El frontend actualiza el progreso en tiempo real
   → status="completed" cuando todos los clips están listos
```

---

## API REST — endpoints principales

| Método | Endpoint | Descripción |
|---|---|---|
| POST | /auth/register | Registro de usuario |
| POST | /auth/login | Login, devuelve JWT |
| POST | /videos/upload | Sube vídeo, inicia procesado |
| GET | /videos/{id}/status | Estado del procesado (también via WS) |
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
Esto levanta: FastAPI (puerto 8000), PostgreSQL (5432), Redis (6379)

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
cp web/.env.example web/.env
```
**Nunca commitees archivos `.env`**

---

## Fases del producto

| Fase | Funcionalidades | Estado |
|---|---|---|
| 1 | Upload vídeo, validación baloncesto, detección posesión, corte de clips | En desarrollo |
| 2 | Biblioteca de clips, etiquetado automático (contraataque, pick & roll...) | Planificado |
| 3 | Creador de ejercicios, anotaciones sobre vídeo | Planificado |
| 4 | Perfiles de equipo, compartir ejercicios, roles (entrenador/jugador) | Planificado |
| 5 | Análisis táctico con IA, estadísticas, migración a Aurora Serverless v2 | Futuro |

Cuando implementes algo, consulta esta tabla para entender el contexto
y no construir en fase 1 algo que pertenece a fases posteriores.

---

## Decisiones de arquitectura (ADRs)

### Por qué monorepo
Claude Code necesita contexto completo para hacer cambios coordinados entre
backend y frontend. Con un monorepo puede ver el contrato de la API y el
cliente que la consume en la misma sesión.

### Por qué PostgreSQL ahora y Aurora después
Aurora Serverless v2 es compatible 100% con PostgreSQL. La migración es
cambiar la variable DATABASE_URL — el código ORM no cambia. Se usa PostgreSQL
en fases tempranas por simplicidad y coste, Aurora cuando el tráfico justifique
el escalado automático.

### Por qué SQS + EC2 GPU para el procesado
El procesado de vídeo con YOLOv8 necesita GPU y puede tardar minutos.
SQS desacopla la API (respuesta inmediata al usuario) de los workers
(procesado en background). Los WebSockets notifican el progreso en tiempo real.

### Por qué shared/ en TypeScript
Web y mobile comparten el mismo lenguaje. Extraer tipos y el cliente API
a shared/ evita duplicar código y garantiza que ambas apps hablen exactamente
el mismo contrato con el backend.

---

## Comandos útiles

```bash
# Crear migración de BD
cd backend && alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
cd backend && alembic upgrade head

# Correr tests backend
cd backend && pytest

# Build de producción web
cd web && npm run build

# Instalar dependencia en shared
cd shared && npm install <paquete>
```

---

## Lo que NO hacer

- No pongas lógica de negocio en los routers del backend
- No llames a la API directamente desde componentes — usa shared/api/
- No uses el directorio pages/ en Next.js — usa app/ (App Router)
- No hardcodees credenciales ni URLs
- No commitees archivos .env
- No instales dependencias de GPU en el contenedor principal de FastAPI —
  el procesado pesado va en los workers de Celery
- No implementes funcionalidades de fases 2-5 hasta que la fase 1 esté sólida
