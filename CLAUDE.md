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

### Después de cada bloque de cambios en backend

**Ejecuta `make check-backend` antes de declarar el trabajo terminado.**

Esto corre pytest completo con coverage. Si algún test falla, no declarar el trabajo terminado.

```bash
make check-backend
# equivalente: docker compose run --rm backend python -m pytest tests/ -q
```

Los tests automatizan las siguientes verificaciones — no hace falta hacerlas manualmente:
- Coherencia de rutas (`test_conventions.py::test_all_api_routes_registered`)
- Convenciones de `shared/api/` (`test_conventions.py::test_no_apiClient_*`)
- Imports de módulos (`test_startup.py::test_module_imports_cleanly`)
- Tablas en Base.metadata (`test_startup.py::test_all_models_are_mapped_on_base`)

**Regla para endpoints nuevos:** cuando añades un endpoint, también añádelo a `expected` en `test_conventions.py::test_all_api_routes_registered`. El test fallará hasta que lo hagas — así es como funciona.

**Coherencia modelo ↔ schema ↔ migración — verificación manual para cada modelo nuevo:**
- Cada campo del modelo SQLAlchemy tiene su columna en la migración Alembic.
- Cada campo del schema Pydantic de respuesta existe en el modelo ORM.
- Los nombres de columnas y tipos coinciden (ej: `starts_at` no `start_date`).

**Truncamiento y corrupción de archivos — problema conocido del mount bash:**

El Write/Edit tool escribe en el filesystem Windows, pero el mount bash (`/sessions/.../mnt/`) puede ver una versión desactualizada. Esto provoca dos bugs al usar `cat >>`:
- **Null bytes al final**: el append sobreescribe bytes ya escritos por el Write tool.
- **Contenido duplicado**: el mount ve el archivo truncado, el append añade el trozo "que falta", pero el Write tool ya lo tenía — resultado: el bloque aparece dos veces.

**Regla crítica**: NUNCA usar `cat >>` para completar archivos. Usar siempre Python:

```python
# ✓ Correcto — leer, modificar, reescribir completo
src = open(path).read()
src = src + "...nuevo contenido..."
open(path, "w").write(src)

# ✗ Incorrecto — puede duplicar contenido
# cat >> archivo << 'EOF' ... EOF
```

Si un archivo TSX está truncado, restaurar desde git:
```bash
git show HEAD:web/components/mi_componente.tsx > web/components/mi_componente.tsx
```

**Migraciones Alembic — columnas con server_default + cast a enum:**
Cuando una columna tiene `server_default` de texto y se quiere cambiar el tipo a un enum PostgreSQL,
hay que dropear el default ANTES del ALTER y restaurarlo DESPUÉS — PostgreSQL no puede castear el
default string al enum automáticamente:
```python
op.execute(sa.text("ALTER TABLE drills ALTER COLUMN court_layout DROP DEFAULT"))
op.execute(sa.text(
    "ALTER TABLE drills"
    "  ALTER COLUMN type TYPE drilltype USING type::drilltype,"
    "  ALTER COLUMN court_layout TYPE courtlayouttype USING court_layout::courtlayouttype"
))
op.execute(sa.text(
    "ALTER TABLE drills ALTER COLUMN court_layout SET DEFAULT 'half_fiba'::courtlayouttype"
))
```

### Después de cada bloque de cambios en shared/ o web/

**Ejecuta `make check-web` antes de declarar el trabajo terminado.**

```bash
make check-web
# Corre en secuencia: shared tsc → web tsc → web lint → web vitest
```

Esto incluye el test de convenciones de imports (`conventions.test.ts`) — no hace falta hacer el grep manualmente.

Errores frecuentes que detecta el lint:
- `@next/next/no-img-element`: usar `<Image />` de `next/image`, o si la URL es externa, añadir el comentario `// eslint-disable-next-line @next/next/no-img-element` (comentario JS, no JSX) en la línea anterior al `<img>`.
- `react/no-unescaped-entities`: los caracteres `"`, `'`, `>`, `{` dentro de texto JSX deben escaparse: `&quot;`, `&apos;`, `&gt;`, `&#123;`.

**Convenciones de shared/api/ — los únicos exports de `client.ts` son:**
`BASE_URL`, `WS_BASE_URL`, `ApiError`, `RequestOptions`, `apiRequest`.
- Usar `apiRequest`, nunca `apiClient` (no existe).
- Bodies de POST/PATCH: siempre `body: JSON.stringify(data)`, nunca objeto plano.
- Estas reglas están cubiertas por `test_conventions.py` — si las rompes, `make check-backend` falla.

**Imports desde shared — usar siempre sub-paths:**
- ✓ `@basketball-clipper/shared/api` · `@basketball-clipper/shared/types`
- ✗ `@basketball-clipper/shared` (root) — cubierto por `conventions.test.ts`
- Si se añade un nuevo sub-módulo, actualizar `exports` en `shared/package.json`.

**Select de shadcn/ui — nunca usar `value=""` en `<SelectItem>`:**
Radix UI usa el string vacío internamente para limpiar la selección. Un `<SelectItem value="">` lanza un error en runtime.
- ✗ `<SelectItem value="">Sin posición</SelectItem>`
- ✓ `<SelectItem value="none">Sin posición</SelectItem>`

El estado del formulario también debe usar `"none"` como valor inicial (no `""`), y la conversión a `null` se hace al enviar:
```tsx
// Estado inicial
const [form, setForm] = useState({ position: "none" });

// Select
<Select value={form.position} onValueChange={(v) => setForm(f => ({ ...f, position: v }))}>
  <SelectItem value="none">Sin posición</SelectItem>
  {POSITIONS.map(p => <SelectItem key={p} value={p}>...</SelectItem>)}
</Select>

// Al enviar
position: form.position === "none" ? null : form.position as PlayerPosition
```
Para campos opcionales que vienen del servidor como `null`:
```tsx
value={entry.position ?? "none"}
onValueChange={(v) => setForm(f => ({ ...f, position: (v === "none" ? null : v) as PlayerPosition | null }))}
```

**7. Botones de acción destructiva (archivar, eliminar) — siempre rojos:**
Todo botón que archive o elimine datos debe ser visualmente rojo en **dos niveles**:
- El botón que abre el dialog de confirmación: `variant="destructive"` (si es un botón de texto) o `className="text-destructive hover:text-destructive hover:bg-destructive/10"` (si es un icono ghost).
- El `AlertDialogAction` de confirmación: siempre con `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"`.

```tsx
{/* ✓ Botón texto que abre el dialog */}
<AlertDialogTrigger asChild>
  <Button variant="destructive" size="sm">Archivar</Button>
</AlertDialogTrigger>

{/* ✓ Botón icono que abre el dialog */}
<AlertDialogTrigger asChild>
  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
    <Archive className="h-3.5 w-3.5" />
  </Button>
</AlertDialogTrigger>

{/* ✓ Acción de confirmación — siempre rojo */}
<AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
  Archivar
</AlertDialogAction>
```

Detección rápida de `AlertDialogAction` sin clase destructiva:
```bash
grep -A2 "AlertDialogAction" web/app/**/*.tsx | grep -v "className.*destructive" | grep -v "Cancelar" | grep "AlertDialogAction"
```

**8. Componentes UI de shadcn/ui — los que existen y los que hay que crear:**
Los siguientes componentes ya están creados en `web/components/ui/`:
`alert`, `alert-dialog`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `progress`, `select`, `skeleton`

Si se necesita un componente nuevo, también hay que añadir su paquete `@radix-ui/react-*` al
`web/package.json` y ejecutar `docker-compose down -v && docker-compose build web && docker-compose up`
para reinstalar los node_modules (el volumen Docker persiste los packages instalados).

**Coherencia shared/api/ ↔ tabla de API REST — para cada función nueva:**
- Cada función en `shared/api/` llama a una URL que existe en la tabla de API de este archivo.
- El método HTTP coincide (GET/POST/PATCH/DELETE).
- Trampa frecuente: `assignProfile` era `/profiles/clubs/${clubId}/profiles` cuando el endpoint real es `/clubs/${clubId}/profiles`.

**Coherencia shared/types/ ↔ schemas Pydantic — para cada tipo nuevo:**
- Los nombres de campos coinciden exactamente (snake_case en ambos lados).
- Los tipos opcionales en Python (`Optional[X]`) corresponden a `X | null` en TypeScript.
- Los enums coinciden: si el backend define `"future" | "active" | "archived"`, el tipo TS debe ser igual.

### Smoke test de login — solo si tocas auth, perfiles o shared/api/
Si `make check` pasa pero sospechas de un problema de integración en el flujo de login, verifica los tres pasos manualmente con el stack levantado:

```bash
# 1. Login → debe devolver access_token
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin1234"}' | python3 -m json.tool

# 2. Con el token obtenido, verificar /auth/me
TOKEN="<token_del_paso_anterior>"
curl -s http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Verificar /profiles (el más crítico — usado por hydrateFromToken)
curl -s http://localhost:8000/profiles \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Por qué importa el paso 3**: `hydrateFromToken` en `web/lib/auth.tsx` llama a `getMe` y `getMyProfiles` en paralelo. Si `getMyProfiles` falla (URL incorrecta, import roto), el frontend muestra "credenciales incorrectas" aunque el login haya funcionado.

### Al finalizar cada sesión
1. **Ejecuta `make check`** — si pasa, puedes declarar el trabajo terminado.
2. **Actualiza `PROGRESS.md`**: marca lo completado, actualiza lo pendiente, añade entrada al historial.
3. **Actualiza `CLAUDE.md`** si cambiaste la arquitectura, añadiste dependencias o tomaste decisiones técnicas nuevas.
4. Si añades un endpoint nuevo: añádelo a la tabla de API REST de este archivo **y** a `expected` en `test_conventions.py::test_all_api_routes_registered`.
5. Si cambias la estructura de archivos: actualiza las secciones de estructura.

### Reglas de coordinación entre capas
- Backend nuevo endpoint → actualizar `shared/api/` y `shared/types/` siempre.
- Cambio en modelo de BD → crear migración Alembic, nunca modificar tablas a mano.
- Nuevo componente web → verificar si tiene equivalente en mobile.
- Cambio en dominio → actualizar `REQUIREMENTS.md` primero, código después.

---

## Errores frecuentes y patrones de diseño

### Error 1 — Comentario ESLint dentro de JSX como nodo hermano

**Síntoma**: `Parsing error: ')' expected` (ESLint) + cascada de errores TypeScript.
**Causa**: `{/* eslint-disable-next-line */}` es un nodo JSX. Dentro de un `return` con un solo elemento, crea dos nodos y JSX falla.

```tsx
// ✗ MAL
return (
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={...} />
);

// ✓ BIEN — comentario JS, no JSX
return (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={...} />
);
```

### Error 2 — Import desde root de `@basketball-clipper/shared`

**Cubierto por test**: `web/lib/__tests__/conventions.test.ts` — si `make check-web` pasa, no hay imports incorrectos.

```tsx
// ✗ MAL
import { listDrills } from "@basketball-clipper/shared";

// ✓ BIEN
import { listDrills } from "@basketball-clipper/shared/api";
import type { DrillSummary } from "@basketball-clipper/shared/types";
```

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
│   │   ├── auth.py           # Login, registro, switch-profile, clear-profile, me
│   │   ├── competitions.py   # Competiciones del equipo (Fase H)
│   │   ├── opponents.py      # Rivales del club + stats de scouting (Fase H)
│   │   ├── profiles.py       # Perfiles del usuario (listar, asignar, archivar)
│   │   ├── clubs.py          # CRUD clubs + gestión de miembros
│   │   ├── seasons.py        # CRUD temporadas (valida una activa por club)
│   │   ├── teams.py          # CRUD equipos por club/temporada
│   │   ├── video.py          # Multipart upload lifecycle + gestión de jobs
│   │   ├── clips.py          # GET /clips, GET /clips/{id}, DELETE /clips/{id}
│   │   ├── exercises.py      # Stub — no implementado aún
│   │   ├── ws.py             # WebSocket /ws/{video_id}
│   │   ├── players.py        # CRUD jugadores + CRUD plantilla (Fase C)
│   │   ├── positions.py      # CRUD posiciones dinámicas del club (Fase C)
│   │   ├── drills.py         # Tags + drills CRUD + clone + variantes (Fase D)
│   │   ├── catalog.py        # Tags del club + catálogo CRUD (Fase E)
│   │   ├── playbook.py       # Playbook del equipo (Fase E)
│   │   ├── matches.py        # Partidos + convocatoria + vídeos + stats (Fase F)
│   │   ├── trainings.py      # Entrenamientos + ejercicios + asistencia (Fase F)
│   │   └── stat_attributes.py # Atributos personalizados + custom stats de partido + staff (Fase I)
│   ├── services/
│   │   ├── detector.py       # YOLOv8 + OpenCV — detección de posesión (LAB + K-means)
│   │   ├── cutter.py         # FFmpeg — corte de clips
│   │   ├── storage.py        # S3/MinIO — upload/download/presigned URLs
│   │   ├── queue.py          # Celery tasks — orquestación del pipeline
│   │   └── catalog.py        # Lógica de negocio del catálogo: copias, freeze, ruptura de referencias
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py           # User (+ is_admin)
│   │   ├── competition.py    # Competition (Fase H)
│   │   ├── opponent.py       # OpponentTeam, OpponentPlayer, OpponentMatchStat (Fase H)
│   │   ├── club.py           # Club
│   │   ├── season.py         # Season + SeasonStatus enum
│   │   ├── team.py           # Team
│   │   ├── club_member.py    # ClubMember (UNIQUE club_id+user_id)
│   │   ├── profile.py        # Profile + UserRole enum
│   │   ├── video.py          # Video + VideoStatus enum (+ team_id FK)
│   │   ├── clip.py           # Clip
│   │   ├── exercise.py       # Exercise (stub)
│   │   ├── player.py         # Player + RosterEntry + PlayerPosition enum (Fase C)
│   │   ├── club_position.py  # ClubPosition + player_positions M2M (Fase C)
│   │   ├── drill.py          # Drill, Tag, DrillType, CourtLayoutType, drill_tags M2M (Fase D)
│   │   ├── club_tag.py       # ClubTag — tags del catálogo del club (Fase E)
│   │   ├── catalog.py        # ClubCatalogEntry + catalog_entry_tags M2M (Fase E)
│   │   ├── playbook.py       # TeamPlaybookEntry (Fase E)
│   │   ├── match.py          # Match + MatchPlayer + MatchStat + MatchVideo + enums (Fase F)
│   │   ├── training.py       # Training + TrainingDrill + TrainingAttendance + AbsenceReason (Fase F)
│   │   └── stat_attribute.py  # TeamStatAttribute + CustomMatchStat + StatAttributeType (Fase I)
│   └── schemas/
│       ├── auth.py           # Login, Register, TokenResponse, UserResponse, SwitchProfileRequest
│       ├── club.py           # Club, Season, Team, ClubMember, Profile schemas
│       ├── video.py          # InitUpload, CompleteUpload, etc.
│       ├── clip.py
│       ├── drill.py          # Drill, Tag schemas (Fase D)
│       ├── catalog.py        # ClubTag, CatalogEntry schemas (Fase E)
│       ├── playbook.py       # PlaybookEntry schemas (Fase E)
│       ├── player.py         # Player, RosterEntry, ClubPosition schemas (Fase C)
│       ├── match.py          # Match, MatchPlayer, MatchStat, MatchVideo schemas (Fase F)
│       ├── training.py       # Training, TrainingDrill, TrainingAttendance, AttendanceUpdate schemas (Fase F)
│       └── stat_attribute.py  # StatAttributeCreate/Update/Response, CustomMatchStatUpsert/Response, AddStaffRequest (Fase I)
├── alembic/versions/
│   ├── 0001_initial_schema.py
│   ├── 0002_multipart_upload.py
│   ├── 0003_add_video_title.py
│   ├── 0004_phase_a_org_structure.py
│   ├── 0005_phase_c_players.py
│   ├── 0006_phase_d_drills.py
│   ├── 0007_phase_e_catalog_playbook.py
│   ├── 0008_add_player_phone.py
│   ├── 1f6f880ded2f_phase_f_matches_trainings.py  # Fase F — nombre usa hash Alembic
│   ├── 0009_match_scores_drill_unique.py
│   ├── 0010_dynamic_club_positions.py
│   ├── 0011_match_status_transitions.py
│   ├── 0012_training_attendance_states.py
│   ├── 0013_match_stat_blocks.py
│   ├── 0014_phase_g_favorites.py
│   ├── 0015_phase_g_training_duration.py
│   ├── 0016_phase_g_drill_groups.py
│   ├── 0019_phase_h_competitions_rivals.py
│   ├── 0020_rival_color_competition_format.py
│   ├── 0021_competition_overtime_minutes.py
│   ├── 0022_match_minutes_tracking.py
│   └── 0023_team_stat_attributes.py
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
│   ├── page.tsx              # Dashboard / landing (con secciones DT: equipos, asistencia, top performers)
│   ├── select-profile/page.tsx  # Selector de perfil a pantalla completa (sin perfil activo)
│   ├── profile/page.tsx      # Página de perfil del usuario
│   ├── upload/page.tsx       # Página de subida de vídeo (acepta ?returnTo= y ?opponent=)
│   ├── videos/
│   │   ├── page.tsx          # Lista de vídeos del usuario
│   │   └── [id]/
│   │       ├── page.tsx      # Detalle: progreso + clips generados
│   │       └── clips/[clipId]/page.tsx
│   ├── players/page.tsx      # Lista de jugadores del club (Fase C)
│   ├── drills/
│   │   ├── page.tsx          # Biblioteca personal — tabs drill/play (Fase D)
│   │   └── [id]/edit/page.tsx  # Editor canvas + árbol de secuencias (Fase D)
│   ├── clubs/[clubId]/
│   │   ├── opponents/page.tsx  # Directorio de rivales del club + plantilla (Fase H)
│   │   ├── catalog/page.tsx  # Catálogo del club (Fase E)
│   │   ├── members/page.tsx  # Gestión de miembros del club
│   │   ├── positions/page.tsx  # Posiciones dinámicas del club (Fase C)
│   │   ├── seasons/page.tsx  # Temporadas del club
│   │   └── teams/page.tsx    # Equipos del club
│   ├── teams/[teamId]/
│   │   ├── competitions/page.tsx  # Competiciones/ligas del equipo (Fase H)
│   │   ├── roster/page.tsx   # Plantilla del equipo (Fase C)
│   │   ├── playbook/page.tsx # Playbook del equipo (Fase E)
│   │   ├── matches/
│   │   │   ├── page.tsx      # Lista de partidos (Fase F)
│   │   │   └── [matchId]/page.tsx  # Detalle: convocatoria, vídeos, stats (Fase F)
│   │   └── trainings/
│   │       ├── page.tsx      # Lista + historial de asistencia (Fase F)
│   │       └── [trainingId]/page.tsx  # Detalle: ejercicios + asistencia 3 estados (Fase F)
│   └── (auth)/
│       ├── login/page.tsx
│       └── register/page.tsx
├── components/
│   ├── ui/                   # shadcn/ui: alert, alert-dialog, badge, button, card, dialog, input, label, progress, select, skeleton
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── ProfileSelector.tsx   # Dropdown selector de perfil activo (RF-010)
│   │   └── PageShell.tsx         # requireAuth + requireProfile (→ /select-profile)
│   ├── drill-editor/
│   │   ├── CourtBackground.tsx   # Cancha SVG FIBA
│   │   ├── CourtCanvas.tsx       # Canvas interactivo: drag, drop, dibujo de líneas
│   │   ├── ElementPalette.tsx    # Barra lateral de elementos arrastrables
│   │   ├── ElementRenderer.tsx   # Renderiza cada SketchElement como SVG
│   │   ├── PropertiesPanel.tsx   # Panel de propiedades del elemento seleccionado
│   │   ├── SequenceTreePanel.tsx # Árbol de secuencias (RF-192)
│   │   ├── DrillEditor.tsx       # Orquestador: tabs, Ctrl+Z/Y/S, auto-save
│   │   ├── court-utils.ts        # Constantes FIBA y helpers de coordenadas
│   │   └── tree-utils.ts         # Manipulación inmutable del árbol de SequenceNode
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
│   ├── video.ts, clip.ts, user.ts, auth.ts, club.ts
│   ├── player.ts         # Player, RosterEntry, PlayerPosition, POSITION_LABELS (Fase C)
│   ├── drill.ts          # DrillType, CourtLayoutType, SketchElement, SequenceNode, Tag, Drill (Fase D)
│   ├── catalog.ts        # ClubTag, CatalogEntry, PlaybookEntry (Fases E)
│   ├── competition.ts    # Competition, CompetitionCreate/Update (Fase H)
│   ├── match.ts          # Match, MatchStatus, MatchPlayer, MatchStat, MatchVideo (Fase F)
│   ├── opponent.ts       # OpponentTeam, OpponentPlayer, OpponentMatchStat (Fase H)
│   ├── training.ts       # Training, TrainingDrill, TrainingAttendance, AbsenceReason (Fase F)
│   └── stat_attribute.ts  # TeamStatAttribute, CustomMatchStat, StatAttributeType, AddStaffRequest (Fase I)
│   └── index.ts
└── api/
    ├── client.ts, auth.ts, videos.ts, videoUpload.ts, clips.ts, clubs.ts
    ├── players.ts        # listPlayers, createPlayer, updatePlayer, archivePlayer, roster CRUD (Fase C)
    ├── positions.ts      # listPositions, createPosition, updatePosition, archivePosition (Fase C)
    ├── drills.ts         # Tags CRUD + drills CRUD + clone + variants (Fase D)
    ├── catalog.ts        # Tags del club + catálogo CRUD (Fase E)
    ├── playbook.ts       # listPlaybook, addToPlaybook, removeFromPlaybook (Fase E)
    ├── competitions.ts   # listCompetitions, createCompetition, updateCompetition, archiveCompetition, setDefault (Fase H)
    ├── matches.ts        # CRUD + convocatoria + vídeos + stats + startMatch/finishMatch/cancelMatch (Fase F)
    ├── opponents.ts      # CRUD OpponentTeam + OpponentPlayer + upsertOpponentStat + deleteOpponentStat (Fase H)
    ├── trainings.ts      # CRUD + ejercicios + asistencia (Fase F)
    ├── stat_attributes.ts # listStatAttributes, createStatAttribute, updateStatAttribute, archiveStatAttribute, listCustomMatchStats, upsertCustomMatchStat, deleteCustomMatchStat, addTeamStaff, removeTeamStaff (Fase I)
    └── index.ts
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

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | /auth/register | — | Registro |
| POST | /auth/login | — | Login → JWT |
| POST | /auth/switch-profile | user | Cambia perfil activo → nuevo JWT con profile_id |
| POST | /auth/clear-profile | user | Elimina profile_id del token → selector de perfil |
| GET | /auth/me | user | Usuario autenticado |
| GET | /profiles | user | Perfiles activos del usuario (enriquecidos) |
| DELETE | /profiles/{id} | user | Archivar perfil |
| POST | /clubs | admin | Crear club |
| GET | /clubs/mine | user | Clubs a los que pertenece el usuario |
| GET | /clubs/{id} | member | Detalle de club |
| PATCH | /clubs/{id} | tech_director | Actualizar club |
| GET | /clubs/{id}/members | member | Listar miembros |
| POST | /clubs/{id}/members | tech_director | Añadir miembro al club (acepta email o user_id) |
| GET | /clubs/{id}/profiles | tech_director | Listar todos los perfiles activos del club |
| POST | /clubs/{id}/profiles | tech_director | Asignar perfil (rol) a un miembro |
| GET | /clubs/{id}/seasons | member | Listar temporadas |
| POST | /clubs/{id}/seasons | tech_director | Crear temporada |
| PATCH | /clubs/{id}/seasons/{sid} | tech_director | Cambiar estado de temporada |
| GET | /clubs/{id}/teams | member | Listar equipos (filtrable por season_id) |
| POST | /clubs/{id}/teams | tech_director | Crear equipo |
| GET | /clubs/{id}/teams/{tid} | member | Detalle de equipo |
| PATCH | /clubs/{id}/teams/{tid} | tech_director | Archivar equipo |
| POST | /videos/init-upload | profile | Inicia multipart: crea Video + presigned URLs |
| GET | /videos/{id}/upload-status | user | Partes subidas (reanudar) |
| POST | /videos/{id}/complete-upload | user | Cierra multipart, encola pipeline |
| POST | /videos/{id}/abort-upload | user | Aborta upload, limpia S3 |
| GET | /videos | user | Lista vídeos del usuario |
| GET | /videos/{id}/status | user | Estado del procesado |
| POST | /videos/{id}/retry | user | Re-encola si está en error |
| DELETE | /videos/{id} | user | Borra vídeo + clips + S3 |
| GET | /clips | user | Lista clips del usuario |
| GET | /clips/{id} | user | Detalle de clip |
| DELETE | /clips/{id} | user | Eliminar clip |
| WS | /ws/{video_id} | — | Progreso en tiempo real |
| GET | /clubs/{id}/positions | member | Listar posiciones activas del club |
| POST | /clubs/{id}/positions | td_or_hc | Crear posición |
| PATCH | /clubs/{id}/positions/{pos_id} | td_or_hc | Actualizar posición |
| DELETE | /clubs/{id}/positions/{pos_id} | td_or_hc | Archivar posición |
| POST | /clubs/{id}/players/photo-upload-url | td_or_hc | Presigned PUT URL para subir foto de jugador a S3 |
| POST | /clubs/{id}/players/import-csv | td_or_hc | Importar jugadores desde CSV (multipart/form-data) |
| GET | /clubs/{id}/players | member | Listar jugadores del club |
| POST | /clubs/{id}/players | td_or_hc | Crear jugador |
| GET | /clubs/{id}/players/{pid} | member | Detalle de jugador |
| PATCH | /clubs/{id}/players/{pid} | td_or_hc | Actualizar jugador |
| DELETE | /clubs/{id}/players/{pid} | td_or_hc | Archivar jugador (RF-090) |
| GET | /clubs/{id}/teams/{tid}/roster | member | Listar plantilla |
| POST | /clubs/{id}/teams/{tid}/roster | td_or_hc | Añadir jugador a plantilla |
| PATCH | /clubs/{id}/teams/{tid}/roster/{eid} | td_or_hc | Actualizar entrada plantilla |
| DELETE | /clubs/{id}/teams/{tid}/roster/{eid} | td_or_hc | Retirar jugador de plantilla |
| PATCH | /clubs/{id}/teams/{tid}/playbook/{entry_id} | member | Actualizar nota de coach en entrada del playbook |
| GET | /clubs/{id}/teams/{tid}/competitions | member | Listar competiciones del equipo (filtrable por season_id) |
| POST | /clubs/{id}/teams/{tid}/competitions | td_or_hc | Crear competición |
| PATCH | /clubs/{id}/teams/{tid}/competitions/{comp_id} | td_or_hc | Actualizar competición |
| DELETE | /clubs/{id}/teams/{tid}/competitions/{comp_id} | td_or_hc | Archivar competición |
| POST | /clubs/{id}/teams/{tid}/competitions/{comp_id}/set-default | td_or_hc | Marcar como competición predeterminada |
| GET | /clubs/{id}/opponents | member | Listar rivales del club |
| GET | /clubs/{id}/opponents/{opp_id} | member | Detalle de rival (con plantilla de jugadores) |
| POST | /clubs/{id}/opponents | td_or_hc | Crear rival |
| PATCH | /clubs/{id}/opponents/{opp_id} | td_or_hc | Actualizar rival |
| DELETE | /clubs/{id}/opponents/{opp_id} | td_or_hc | Archivar rival |
| POST | /clubs/{id}/opponents/{opp_id}/players | td_or_hc | Añadir jugador rival |
| PATCH | /clubs/{id}/opponents/{opp_id}/players/{pid} | td_or_hc | Actualizar jugador rival |
| DELETE | /clubs/{id}/opponents/{opp_id}/players/{pid} | td_or_hc | Archivar jugador rival |
| POST | /clubs/{id}/teams/{tid}/matches/{match_id}/opponent-stats | td_or_hc | Upsert estadística de scouting (jugador rival) |
| DELETE | /clubs/{id}/teams/{tid}/matches/{match_id}/opponent-stats/{stat_id} | td_or_hc | Eliminar estadística de scouting |
| POST | /clubs/{id}/teams/{tid}/staff | hc_or_td | Añadir miembro de staff al equipo (HC solo puede añadir staff_member) |
| DELETE | /clubs/{id}/teams/{tid}/staff/{profile_id} | hc_or_td | Retirar miembro de staff del equipo |
| GET | /clubs/{id}/teams/{tid}/stat-attributes | member | Listar atributos de estadística personalizados del equipo |
| POST | /clubs/{id}/teams/{tid}/stat-attributes | hc_or_td | Crear atributo de estadística personalizado |
| PATCH | /clubs/{id}/teams/{tid}/stat-attributes/{attr_id} | hc_or_td | Renombrar atributo de estadística |
| DELETE | /clubs/{id}/teams/{tid}/stat-attributes/{attr_id} | hc_or_td | Archivar atributo de estadística |
| GET | /clubs/{id}/teams/{tid}/matches/{match_id}/custom-stats | member | Listar estadísticas personalizadas de un partido |
| PUT | /clubs/{id}/teams/{tid}/matches/{match_id}/custom-stats | hc_or_td | Upsert estadística personalizada (por jugador + atributo) |
| DELETE | /clubs/{id}/teams/{tid}/matches/{match_id}/custom-stats/{stat_id} | hc_or_td | Eliminar estadística personalizada |
| GET | /drills/tags | user | Listar tags personales |
| POST | /drills/tags | user | Crear tag |
| PATCH | /drills/tags/{id} | user | Actualizar tag |
| DELETE | /drills/tags/{id} | user | Archivar tag |
| GET | /drills | user | Biblioteca personal (filtrable por type/tag) |
| POST | /drills | user | Crear drill/play |
| GET | /drills/{id} | author | Detalle con root_sequence |
| PATCH | /drills/{id} | author | Actualizar (incluye root_sequence) |
| DELETE | /drills/{id} | author | Archivar drill/play |
| POST | /drills/{id}/clone | author | Clonar en biblioteca personal (RF-151) |
| POST | /drills/{id}/variants | author | Crear variante (RF-140) |
| GET | /clubs/{id}/catalog/tags | member | Listar tags del catálogo del club |
| POST | /clubs/{id}/catalog/tags | tech_director | Crear tag del club |
| PATCH | /clubs/{id}/catalog/tags/{tag_id} | tech_director | Actualizar tag del club |
| DELETE | /clubs/{id}/catalog/tags/{tag_id} | te