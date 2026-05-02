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
Ejecuta siempre estas verificaciones antes de declarar el trabajo terminado:

**1. Sintaxis Python — todos los archivos tocados:**
```bash
cd backend
python -m py_compile \
  app/main.py \
  app/core/security.py \
  app/models/__init__.py \
  # añade aquí los archivos que hayas creado o modificado
&& echo "ALL OK"
```

**2. Coherencia de rutas — para cada router nuevo o modificado:**
- Comprueba el `prefix` con el que está registrado en `main.py`.
- Verifica que `prefix + path_del_decorator` da la URL documentada en la tabla de API.
- Ejemplo: prefix `/clubs` + `@router.post("/{id}/profiles")` → `POST /clubs/{id}/profiles` ✓
- Trampa común: un endpoint en router `/profiles` con path `/clubs/{id}/profiles` → `POST /profiles/clubs/{id}/profiles` ✗

**3. Coherencia modelo ↔ schema ↔ migración — para cada modelo nuevo:**
- Cada campo del modelo SQLAlchemy tiene su columna en la migración Alembic.
- Cada campo del schema Pydantic de respuesta existe en el modelo ORM.
- Los nombres de columnas y tipos coinciden (ej: `starts_at` no `start_date`).

**4. Imports — para cada router:**
- Todos los modelos y schemas importados en el router se usan realmente.
- No hay imports que ya no hagan falta tras refactorizaciones.

**5. Truncamiento de archivos — el Write tool puede truncar archivos largos:**
```bash
xxd backend/app/routers/mi_router.py | tail -3
# El último byte debe ser 0a (newline). Si el archivo termina a mitad de línea, está truncado.
# Solución: reescribir el archivo completo via cat > archivo << 'PYEOF' ... PYEOF
```

**6. Migraciones Alembic — columnas con server_default + cast a enum:**
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
Ejecuta siempre estas verificaciones antes de declarar el trabajo terminado:

**1. Lint de Next.js — ejecutar SIEMPRE antes de declarar terminado:**
```bash
cd web && npm run lint 2>&1 | tail -20
```
Errores frecuentes que bloquean CI:
- `@next/next/no-img-element`: usar `<Image />` de `next/image`, o si la URL es externa y no se puede configurar en `next.config.js`, añadir `{/* eslint-disable-next-line @next/next/no-img-element */}` en la línea anterior.
- `react/no-unescaped-entities`: los caracteres `"`, `'`, `>`, `{` dentro de texto JSX deben escaparse con `&quot;`, `&apos;`, `&gt;`, `&#123;` — o extraerse a una variable JS.
  - ✗ `<p>Resultados de "{search}"</p>`
  - ✓ `<p>Resultados de &quot;{search}&quot;</p>`

**2. Type-check de TypeScript — shared y web:**
```bash
# Verificar shared/ (sin emitir archivos)
cd /path/to/project
npx tsc --project shared/tsconfig.json --noEmit 2>&1 | head -40

# Verificar web/
npx tsc --project web/tsconfig.json --noEmit 2>&1 | head -40
```
Si `tsconfig.json` no tiene `noEmit`, añadir `--noEmit` de todas formas — solo queremos errores, no output.

**2. Coherencia de imports en shared/api/ — regla crítica:**
- Los únicos exports de `shared/api/client.ts` son: `BASE_URL`, `WS_BASE_URL`, `ApiError`, `RequestOptions`, `apiRequest`.
- Ningún archivo de `shared/api/` debe importar `apiClient` — no existe.
- Todos los bodies de POST/PATCH deben pasarse como `body: JSON.stringify(data)`, nunca como objeto plano.
- Verificar con grep:
```bash
grep -r "apiClient" shared/api/   # debe devolver 0 resultados
grep -r "body: {" shared/api/     # debe devolver 0 resultados (usar JSON.stringify)
grep -r "body: data" shared/api/  # debe devolver 0 resultados
```

**5. Imports desde shared — usar siempre sub-paths, nunca el root:**
- Las páginas web deben importar desde `@basketball-clipper/shared/api` o `@basketball-clipper/shared/types`.
- NUNCA usar `@basketball-clipper/shared` (root) directamente — el `package.json` de shared
  ahora expone `"."` pero es más explícito y seguro usar los sub-paths.
- `shared/package.json` exports correctos:
```json
{
  ".": "./index.ts",
  "./types": "./types/index.ts",
  "./api": "./api/index.ts"
}
```
- Si se añade un nuevo sub-módulo, actualizar el `exports` en `shared/package.json`.

**6. Select de shadcn/ui — nunca usar `value=""` en `<SelectItem>`:**
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

**7. Truncamiento de archivos web — restaurar desde git:**
Si un archivo TypeScript/TSX está truncado (termina a mitad de código), restaurarlo desde git:
```bash
git show HEAD:web/components/mi_componente.tsx > web/components/mi_componente.tsx
# Verificar:
tail -1 web/components/mi_componente.tsx   # debe ser "}" o similar
wc -l web/components/mi_componente.tsx     # comparar con git show HEAD:... | wc -l
```

**3. Coherencia shared/api/ ↔ tabla de API REST — para cada función nueva:**
- Cada función en `shared/api/` llama a una URL que existe en la tabla de API de este archivo.
- El método HTTP coincide (GET/POST/PATCH/DELETE).
- Las URLs con `profile_id`, `club_id`, etc. coinciden exactamente con el patrón del endpoint.
- Trampa frecuente: `assignProfile` era `/profiles/clubs/${clubId}/profiles` cuando el endpoint real es `/clubs/${clubId}/profiles`.

**4. Coherencia shared/types/ ↔ schemas Pydantic — para cada tipo nuevo:**
- Los nombres de campos coinciden exactamente (snake_case en ambos lados).
- Los tipos opcionales en Python (`Optional[X]`) corresponden a `X | null` en TypeScript.
- Los enums coinciden: si el backend define `"future" | "active" | "archived"`, el tipo TS debe ser igual.

### Smoke test de login — ejecutar siempre tras cambios en auth o shared/api/
Antes de declarar cualquier tarea terminada que toque auth, perfiles o shared/api, verificar manualmente (o con curl) que el flujo de login funciona de extremo a extremo:

```bash
# 1. Login → debe devolver access_token
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin1234"}' | python3 -m json.tool

# 2. Con el token obtenido, verificar /auth/me
TOKEN="<token_del_paso_anterior>"
curl -s http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Verificar /profiles (usado por hydrateFromToken en el frontend)
curl -s http://localhost:8000/profiles \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Si cualquiera de estos tres pasos falla, el login del frontend fallará — aunque el backend devuelva 200 en `/auth/login`.

**Por qué importa el paso 3**: `hydrateFromToken` en `web/lib/auth.tsx` llama a `getMe` y `getMyProfiles` en paralelo después del login. Si `getMyProfiles` lanza un error (por import roto, URL incorrecta, o respuesta inesperada), el `catch` del formulario de login muestra "credenciales incorrectas" aunque el login haya funcionado.

### Al finalizar cada sesión
1. **Ejecuta las verificaciones de backend** descritas arriba sobre todos los archivos tocados.
2. **Ejecuta las verificaciones de shared/web** si tocaste TypeScript.
3. **Ejecuta el smoke test de login** si tocaste auth, perfiles o shared/api/.
4. **Actualiza `PROGRESS.md`**: marca lo completado, actualiza lo pendiente, añade entrada al historial.
5. **Actualiza `CLAUDE.md`** si cambiaste la arquitectura, añadiste dependencias o tomaste decisiones técnicas nuevas.
6. Si añades un endpoint nuevo: actualiza la tabla de API REST de este archivo.
7. Si cambias la estructura de archivos: actualiza las secciones de estructura.

### Reglas de coordinación entre capas
- Backend nuevo endpoint → actualizar `shared/api/` y `shared/types/` siempre.
- Cambio en modelo de BD → crear migración Alembic, nunca modificar tablas a mano.
- Nuevo componente web → verificar si tiene equivalente en mobile.
- Cambio en dominio → actualizar `REQUIREMENTS.md` primero, código después.

---

## Errores frecuentes detectados en auditoría (2026-04-29)

Esta sección documenta los patrones de error encontrados en la auditoría web de la sesión 16.

### Error 1 — Comentario ESLint dentro de JSX como nodo hermano

**Archivo afectado**: `web/app/players/page.tsx`
**Síntoma**: `Parsing error: ')' expected` (ESLint) y cascada de errores TypeScript.
**Causa**: La forma `{/* eslint-disable-next-line */}` es un nodo JSX. Si se pone dentro de una función que retorna un solo elemento, se convierte en un segundo nodo junto con el siguiente elemento y JSX no puede tener dos nodos sin wrapper:

```tsx
// ✗ MAL — el comentario es un nodo JSX, el <img> es otro → parse error
return (
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={...} />
);
```

**Solución**: usar el comentario JS (`//`) directamente dentro del bloque `return (...)`, inmediatamente antes del elemento:

```tsx
// ✓ BIEN — comentario JS dentro del JSX, justo encima del elemento
return (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={...} />
);
```

**Nota**: Si el eslint-disable-next-line se pone fuera del return (en la línea anterior al `return (`), Next.js lint seguirá reportando el warning porque el comment se aplica al `return`, no al `<img>`.

**Detección automática**: si el archivo falla `npm run lint` con `Parsing error: ')' expected` en una línea `<img`, buscar `{/* eslint-disable` justo antes.

### Error 2 — Import desde root de `@basketball-clipper/shared` en lugar de sub-paths

**Archivo afectado**: `web/app/drills/page.tsx`
**Síntoma**: Funciona en runtime (si `shared/index.ts` re-exporta todo) pero viola la regla de sub-paths y puede causar problemas con tree-shaking, type resolution, y cambios futuros en `shared/package.json`.

```tsx
// ✗ MAL — import desde root
import { listDrills, createDrill } from "@basketball-clipper/shared";
import type { DrillSummary } from "@basketball-clipper/shared";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared";
```

```tsx
// ✓ BIEN — imports desde sub-paths
import { listDrills, createDrill } from "@basketball-clipper/shared/api";
import type { DrillSummary } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";
```

**Detección automática**:
```bash
grep -rn "from '@basketball-clipper/shared'" web/   # debe dar 0 resultados (solo las líneas con /api o /types están OK)
# Afina: sólo los imports sin sub-path:
grep -rn "from '@basketball-clipper/shared'" web/ | grep -v "/api" | grep -v "/types"
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
│   │   └── trainings.py      # Entrenamientos + ejercicios + asistencia (Fase F)
│   ├── services/
│   │   ├── detector.py       # YOLOv8 + OpenCV — detección de posesión (LAB + K-means)
│   │   ├── cutter.py         # FFmpeg — corte de clips
│   │   ├── storage.py        # S3/MinIO — upload/download/presigned URLs
│   │   ├── queue.py          # Celery tasks — orquestación del pipeline
│   │   └── catalog.py        # Lógica de negocio del catálogo: copias, freeze, ruptura de referencias
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py           # User (+ is_admin)
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
│   │   └── training.py       # Training + TrainingDrill + TrainingAttendance + AbsenceReason (Fase F)
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
│       └── training.py       # Training, TrainingDrill, TrainingAttendance, AttendanceUpdate schemas (Fase F)
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
│   └── 0016_phase_g_drill_groups.py
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
│   │   ├── catalog/page.tsx  # Catálogo del club (Fase E)
│   │   ├── members/page.tsx  # Gestión de miembros del club
│   │   ├── positions/page.tsx  # Posiciones dinámicas del club (Fase C)
│   │   ├── seasons/page.tsx  # Temporadas del club
│   │   └── teams/page.tsx    # Equipos del club
│   ├── teams/[teamId]/
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
│   ├── match.ts          # Match, MatchStatus, MatchPlayer, MatchStat, MatchVideo (Fase F)
│   ├── training.ts       # Training, TrainingDrill, TrainingAttendance, AbsenceReason (Fase F)
│   └── index.ts
└── api/
    ├── client.ts, auth.ts, videos.ts, videoUpload.ts, clips.ts, clubs.ts
    ├── players.ts        # listPlayers, createPlayer, updatePlayer, archivePlayer, roster CRUD (Fase C)
    ├── positions.ts      # listPositions, createPosition, updatePosition, archivePosition (Fase C)
    ├── drills.ts         # Tags CRUD + drills CRUD + clone + variants (Fase D)
    ├── catalog.ts        # Tags del club + catálogo CRUD (Fase E)
    ├── playbook.ts       # listPlaybook, addToPlaybook, removeFromPlaybook (Fase E)
    ├── matches.ts        # CRUD + convocatoria + vídeos + stats + startMatch/finishMatch/cancelMatch (Fase F)
    ├── trainings.ts      # CRUD + ejercicios + asistencia (Fase F)
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