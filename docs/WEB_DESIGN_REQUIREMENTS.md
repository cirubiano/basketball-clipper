# Requisitos de Diseño UX/UI — Web Frontend

> **Propósito**: documento de referencia para mantener consistencia visual al implementar nuevas pantallas (Fase F y posteriores). Refleja el estado implementado del frontend en `web/`.
>
> **Fuente de verdad del dominio**: `REQUIREMENTS.md`  
> **Fuente de verdad técnica**: `CLAUDE.md`  
> **Última actualización**: 2026-04-26

---

## Tabla de contenidos

1. [Stack y dependencias](#1-stack-y-dependencias)
2. [Sistema de diseño](#2-sistema-de-diseño)
3. [Estructura de navegación](#3-estructura-de-navegación)
4. [Layouts y wrappers globales](#4-layouts-y-wrappers-globales)
5. [Pantallas implementadas](#5-pantallas-implementadas)
6. [Componentes reutilizables](#6-componentes-reutilizables)
7. [Patrones de UX recurrentes](#7-patrones-de-ux-recurrentes)
8. [Flujos de usuario principales](#8-flujos-de-usuario-principales)
9. [Gaps y mejoras detectadas](#9-gaps-y-mejoras-detectadas)

---

## 1. Stack y dependencias

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 14.2.3 | Framework (App Router) |
| React | 18.3.1 | UI |
| TypeScript | — | Lenguaje |
| Tailwind CSS | 3.4.3 | Estilos utilitarios |
| shadcn/ui | — | Sistema de componentes (Radix UI) |
| @tanstack/react-query | 5.37.1 | Fetching y caché de datos |
| lucide-react | 0.378.0 | Iconografía SVG |
| class-variance-authority | 0.7.0 | Variantes de componentes |
| clsx + tailwind-merge | — | Composición de clases Tailwind |

**Paquetes Radix UI instalados**: `alert-dialog`, `dialog`, `label`, `progress`, `select`, `slot`.

---

## 2. Sistema de diseño

### 2.1 Paleta de colores

El sistema usa **variables CSS en formato HSL** definidas en `globals.css`. Tailwind las consume vía `hsl(var(--nombre))`. El modo oscuro se activa con la clase `dark` en `<html>` (estrategia `"class"`).

| Token | Uso |
|---|---|
| `background` / `foreground` | Fondo y texto principal de página |
| `card` / `card-foreground` | Fondo y texto de tarjetas |
| `primary` / `primary-foreground` | Acción principal (botones CTA) |
| `secondary` / `secondary-foreground` | Botones secundarios, badges |
| `muted` / `muted-foreground` | Texto secundario, placeholders, skeletons |
| `accent` / `accent-foreground` | Hover de items de lista/nav |
| `destructive` / `destructive-foreground` | Errores, acciones de borrado |
| `border` | Bordes de inputs, cards, separadores |
| `input` | Fondo específico de inputs |
| `ring` | Focus ring de inputs y botones |

**Colores de marca adicionales** (usados directamente con clases Tailwind):

| Clase | Dónde se usa |
|---|---|
| `bg-zinc-950` | Navbar (fondo oscuro) |
| `text-zinc-100` | Texto sobre navbar |
| `bg-blue-50` | Fondo hover de badges de equipo |
| `border-gray-200` | Separadores ligeros en tablas |

### 2.2 Tipografía

Next.js usa la fuente del sistema (sin `next/font` configurado explícitamente). La jerarquía se establece con clases Tailwind:

| Nivel | Clases | Uso |
|---|---|---|
| H1 / Título de página | `text-2xl font-bold` | Encabezado principal de cada pantalla |
| H2 / Sección | `text-xl font-semibold` | Subtítulos, títulos de card |
| Cuerpo | `text-sm` | Contenido general |
| Secundario | `text-sm text-muted-foreground` | Metadatos, labels de ayuda |
| Micro | `text-xs text-muted-foreground` | Timestamps, IDs, info reducida |

### 2.3 Espaciado

Se siguen los valores estándar de Tailwind con los siguientes patrones frecuentes:

| Contexto | Clases |
|---|---|
| Separación vertical entre secciones | `space-y-6` |
| Separación vertical entre elementos de formulario | `space-y-4`, `space-y-2` |
| Gap en grids | `gap-4`, `gap-3` |
| Padding de page container | `px-4 py-6` (mobile), `px-6 py-8` (desktop) |
| Padding interno de card | `p-4`, `p-6` |
| Padding de botones compactos | `px-3 py-2`, `px-3 py-2.5` |

### 2.4 Radios de borde

Controlados por la variable CSS `--radius`. Mapeados como:
- `rounded-lg` → valor base
- `rounded-md` → `calc(--radius - 2px)`
- `rounded-sm` → `calc(--radius - 4px)`

### 2.5 Componentes shadcn/ui instalados

Los siguientes componentes existen en `web/components/ui/`:

| Componente | Archivo | Uso principal |
|---|---|---|
| `Alert` + `AlertDescription` | `alert.tsx` | Mensajes de error inline |
| `AlertDialog` | `alert-dialog.tsx` | Diálogos de confirmación destructiva |
| `Badge` | `badge.tsx` | Etiquetas de estado, roles, tipos |
| `Button` | `button.tsx` | Todos los botones de la app |
| `Card` + sub-componentes | `card.tsx` | Contenedores de contenido |
| `Dialog` + sub-componentes | `dialog.tsx` | Modales de formulario |
| `Input` | `input.tsx` | Campos de texto, fecha, número |
| `Label` | `label.tsx` | Etiquetas de campo |
| `Progress` | `progress.tsx` | Barra de progreso (upload, procesado) |
| `Select` + sub-componentes | `select.tsx` | Dropdowns de selección |
| `Skeleton` | `skeleton.tsx` | Estados de carga placeholder |

**Para agregar un componente nuevo**: instalar su paquete `@radix-ui/react-*` en `web/package.json` y reconstruir el contenedor Docker.

### 2.6 Iconografía

Se usa exclusivamente **Lucide React**. Convenciones de tamaño:

| Contexto | Clases |
|---|---|
| Icono inline en botón con texto | `h-4 w-4` |
| Icono de acción en tabla (hover) | `h-4 w-4` |
| Icono de estado grande | `h-8 w-8` o `h-12 w-12` |
| Spinner de carga | `h-4 w-4 animate-spin` (con `Loader2`) |

Iconos frecuentes por contexto:

| Icono | Uso |
|---|---|
| `Loader2 animate-spin` | Carga asíncrona en botones |
| `Trash2` | Eliminar / archivar |
| `Pencil` / `Edit` | Editar |
| `ChevronDown` / `ChevronUp` | Collapsar paneles, dropdowns |
| `RefreshCw` | Actualizar copia (catálogo) |
| `BookCopy` | Copiar a biblioteca |
| `Lock` | Entrada congelada |
| `Plus` | Crear nuevo |
| `Upload` | Subir vídeo |

---

## 3. Estructura de navegación

### 3.1 Mapa de rutas

```
/                              → Dashboard (últimos 6 vídeos)
├── (auth)/                    → Layout sin navbar
│   ├── login/                 → Formulario de login
│   └── register/              → Formulario de registro
├── select-profile/            → Selector de perfil a pantalla completa
├── upload/                    → Subida y procesado de vídeo
├── videos/                    → Lista completa de vídeos
│   └── [id]/                  → Detalle de vídeo + grid de clips
│       └── clips/[clipId]/    → Reproductor de clip individual
├── players/                   → Gestión de jugadores del club
├── teams/[teamId]/
│   ├── roster/                → Plantilla del equipo
│   └── playbook/              → Playbook del equipo
├── drills/                    → Biblioteca personal de ejercicios/jugadas
│   └── [id]/edit/             → Editor de ejercicio/jugada (canvas + árbol)
└── clubs/[clubId]/
    └── catalog/               → Catálogo del club
```

### 3.2 Acceso condicional por perfil

La **Navbar** filtra los links visibles según el perfil activo:

| Link | Condición |
|---|---|
| Dashboard | Siempre visible |
| Mis vídeos | Siempre visible |
| Biblioteca | Siempre visible |
| Jugadores | Solo si `activeProfile.club_id` existe |
| Catálogo | Solo si `activeProfile.club_id` existe |
| Playbook | Solo si `activeProfile.team_id` existe |

### 3.3 Guards de autenticación

```
Sin token → /login
Con token pero sin perfil activo → /select-profile
Con token y perfil activo → acceso normal
```

El guard se implementa en `PageShell`. Las páginas `(auth)/login`, `(auth)/register` y `select-profile` tienen `requireAuth=false` o `requireProfile=false`.

---

## 4. Layouts y wrappers globales

### 4.1 Root Layout (`app/layout.tsx`)

- Proveedores globales: `<Providers>` (React Query + AuthProvider + UploadJobProvider)
- Widget global persistente: `<FloatingUploadWidget>` (se oculta en `/upload`)
- No incluye Navbar (la Navbar vive dentro de `PageShell`)

### 4.2 Auth Layout (`(auth)/layout.tsx`)

- Sin Navbar
- Fondo: `bg-background`
- Contenido centrado vertical y horizontalmente: `flex min-h-screen items-center justify-center`
- Ancho máximo del card: `max-w-sm w-full`

### 4.3 PageShell (`components/layout/PageShell.tsx`)

Wrapper utilizado en todas las páginas de la app principal.

**Props**:
- `requireAuth: boolean` (default `true`)
- `requireProfile: boolean` (default `true`)
- `children: ReactNode`

**Comportamiento**:
1. Mientras `isLoading`: muestra skeleton de layout
2. Sin usuario y `requireAuth=true`: redirige a `/login`
3. Con usuario pero sin perfil activo y `requireProfile=true`: redirige a `/select-profile`
4. OK: renderiza `<Navbar />` + `<main className="container mx-auto px-4 py-6">` + children

### 4.4 Navbar (`components/layout/Navbar.tsx`)

- Posición: `sticky top-0 z-50`
- Fondo: `bg-zinc-950 backdrop-blur`
- Altura: `h-14` o `h-16`
- Estructura: logo izquierda | links centro | acciones derecha (ProfileSelector + botón Upload + logout)
- Botón Upload: `<Button size="sm">` con icono `Upload`
- Logout: icono `LogOut` como `<Button variant="ghost">`

### 4.5 ProfileSelector (`components/layout/ProfileSelector.tsx`)

- Dropdown `<Button variant="outline">` con `<ChevronDown>`
- Muestra: `[BADGE ROL] Nombre equipo / Club · Temporada`
- Badges de rol: `"DT"` (TechnicalDirector), `"Coach"` (HeadCoach), `"Staff"` (StaffMember)
- Al expandir: lista de todos los perfiles del usuario; click → `switchProfile()`
- Footer del dropdown: `"Cambiar de club"` → `clearActiveProfile()` → `/select-profile`

---

## 5. Pantallas implementadas

### 5.1 Login (`/login`)

**Qué muestra**: card centrado con título "Iniciar sesión", campos email y contraseña, botón de submit, link a registro.

**Acciones**: submit llama a `auth.login(email, password)`.

**Estados**:
- Loading: botón con `<Loader2 animate-spin>` + disabled
- Error: `<Alert variant="destructive">` con el mensaje de error encima del formulario

**Componentes**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Label`, `Input`, `Button`, `Alert`, `AlertDescription`

---

### 5.2 Registro (`/register`)

**Qué muestra**: igual al login con campos adicionales de confirmación de contraseña.

**Validación client-side**:
- Contraseña mínimo 8 caracteres
- Contraseña y confirmación deben coincidir

**Componentes**: ídem login.

---

### 5.3 Selector de perfil (`/select-profile`)

**Qué muestra**: pantalla completa centrada, lista de tarjetas de perfil del usuario.

**Cada tarjeta muestra**: badge de rol + nombre equipo/club + nombre club + temporada activa.

**Acciones**: click en tarjeta → `switchProfile(profileId)` → redirige a `/`.

**Estados**:
- Loading (durante switch): spinner en la tarjeta seleccionada
- Error: `<Alert variant="destructive">`
- Sin perfiles: mensaje "Contacta con tu director técnico para que te asigne un perfil"

**Nota UX**: no tiene navbar. Es una pantalla de "onboarding" entre login y app principal.

---

### 5.4 Dashboard (`/`)

**Qué muestra**: últimos 6 vídeos del usuario en grid, con acceso rápido a subida.

**Grid**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Auto-refresh**: `refetchInterval: 5000` mientras algún vídeo tenga estado `uploading | pending | processing`.

**Acciones por vídeo**: Retry (si error), Delete.

**Estados**:
- Loading: 6 `<Skeleton>` con `aspect-video`
- Sin vídeos: empty state con botón "Sube tu primer vídeo" → `/upload`
- Con vídeos: grid de `<VideoCard>` + link "Ver todos" si hay más de 6

---

### 5.5 Lista de vídeos (`/videos`)

**Qué muestra**: todos los vídeos del usuario con contador en el header.

**Header**: `"X vídeos"` + botón `"Subir vídeo"` → `/upload`

**Grid**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`

**Auto-refresh**: igual que el Dashboard.

**Estados**: loading (skeletons), empty state, grid de `<VideoCard>`.

---

### 5.6 Detalle de vídeo (`/videos/[id]`)

**Qué muestra**: título del vídeo, estado, grid de clips generados.

**Header**:
- Botón back `←` hacia `/videos`
- Título (`video.title` o nombre de archivo)
- Badge de estado (ver § Badges de estado)
- Botón Retry (si `status === "error"`)
- Botón Delete → `<DeleteVideoDialog>`

**Grid de clips**: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`

**Auto-refresh**: cada 5s si el vídeo está procesando.

**Estados**:
- Procesando: `<ProcessingStatus>` stepper visible
- Sin clips tras completar: mensaje informativo
- Con clips: grid de `<ClipCard>`, cada uno clickable → `/videos/[id]/clips/[clipId]`

---

### 5.7 Reproductor de clip (`/videos/[id]/clips/[clipId]`)

**Qué muestra**: reproductor de vídeo + metadatos del clip.

**Estructura**:
- Botón back → `/videos/[id]`
- `<video>` con `controls` nativo del browser
- `<ClipPlayer>` muestra: badge de equipo, tiempo inicio, tiempo fin, duración

---

### 5.8 Subida de vídeo (`/upload`)

**Qué muestra**: formulario de subida + estados de progreso.

**Fase 1 — Formulario** (antes de iniciar):
- Campo título (`<Input>`, validación min 3 chars)
- `<VideoUploader>` drag-and-drop
- Botón "Procesar vídeo" (disabled si no hay archivo o título inválido)

**Fase 2 — Upload en progreso**:
- `<Progress value={uploadPercent} />`
- Texto: `"X MB de Y MB (Z%)"` 
- Botón "Cancelar"

**Fase 3 — Procesando**:
- `<ProcessingStatus>` (stepper de fases)
- El usuario puede navegar a otra página; el widget flotante toma el relevo

**Fase 4 — Completado**:
- Botón "Ver clips generados" → `/videos/[id]`
- Botón "Subir otro"

**Fase 5 — Error**:
- Mensaje de error
- Botón "Intentar de nuevo"

---

### 5.9 Gestión de jugadores (`/players`)

**Qué muestra**: tabla de jugadores del club activo.

**Columnas**: avatar (iniciales), nombre completo, fecha nacimiento, posición, estado (badge "Archivado" si aplica).

**Acciones**:
- Botón "Añadir jugador" → abre dialog de creación
- Fila hover: botón editar → abre dialog de edición, botón archivar → confirma y archiva

**Dialog de creación/edición** (campos):
- `first_name` (`<Input>`)
- `last_name` (`<Input>`)
- `date_of_birth` (`<Input type="date">`)
- `position` (`<Select>`: Base, Escolta, Alero, Ala-pívot, Pívot)

**Estados**: loading skeletons, empty state, tabla poblada.

---

### 5.10 Plantilla del equipo (`/teams/[teamId]/roster`)

**Qué muestra**: tabla de entradas de plantilla del equipo activo.

**Columnas**: dorsal, avatar (iniciales), nombre, posición, estadísticas (PPG, RPG, APG, MPG).

**Acciones**:
- Botón "Añadir jugador" → dialog de asignación (solo jugadores del club no asignados aún)
- Fila hover: editar → dialog de edición, eliminar → quitar de plantilla (sin archivar al jugador)

**Dialog de añadir jugador** (campos):
- Selector de jugador (lista filtrada)
- Dorsal (`<Input type="number">`)
- Posición (`<Select>`)

**Dialog de editar entrada** (campos):
- Dorsal
- Posición
- Estadísticas: PPG, RPG, APG, MPG (`<Input type="number">`)

---

### 5.11 Playbook del equipo (`/teams/[teamId]/playbook`)

**Qué muestra**: lista de ejercicios/jugadas vinculados al equipo.

**Cada entrada muestra**: badge tipo (Play/Drill), nombre, icono de congelado (`Lock`) si aplica.

**Acciones**:
- Click en entrada no congelada + si es autor → va al editor
- Botón "Añadir al playbook" → dialog con selector de drill de la biblioteca personal
- Botón eliminar → quita del playbook (sin archivar el drill)

**Entradas congeladas**: read-only, sin acceso al editor. Tooltip explicativo.

---

### 5.12 Biblioteca personal de drills (`/drills`)

**Qué muestra**: lista tabular de ejercicios y jugadas propias.

**Tabs**: "Todo" | "Ejercicios" | "Jugadas"

**Columnas**: badge tipo, nombre, indicador de variante, disposición de pista (court layout), fecha, tags.

**Acciones en fila** (visibles en hover, con `opacity-0 group-hover:opacity-100`):
- Clonar (`Copy`)
- Archivar (`Trash2`)
- Editar → `/drills/[id]/edit`

**Botón "Nuevo"** → dialog de creación con:
- Tipo: Ejercicio / Jugada (`<Select>`)
- Nombre (`<Input>`)
- Disposición de pista: `full_fiba`, `half_fiba`, `full_nba`, `half_nba` (`<Select>`)

---

### 5.13 Editor de drill/jugada (`/drills/[id]/edit`)

**Qué muestra**: editor de canvas de pista con árbol de secuencias.

**Estructura de la pantalla**:

```
┌──────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Back] [Tipo] [Nombre] [Layout] [Undo] [Redo] [Save]│
├──────────────┬───────────────────────────┬───────────────────┤
│ ElementPalette│      CourtCanvas (SVG)    │ Properties /      │
│ (izquierda)   │      (centro, flex-grow)  │ SequenceTree      │
│               │                           │ (derecha)         │
└──────────────┴───────────────────────────┴───────────────────┘
```

**Toolbar**:
- Botón Back con confirmación si hay cambios sin guardar (dirty state)
- Label de tipo no editable
- Input de nombre (inline, editable)
- Select de court layout
- Botones Undo / Redo (con `Ctrl+Z` / `Ctrl+Y`)
- Botón Save (disabled cuando no hay cambios, `Ctrl+S`)

**Panel izquierdo — ElementPalette**:
- Categorías colapsables: Jugadores, Balón, Líneas de movimiento, Zonas, Texto
- Elementos arrastrables al canvas

**Canvas central — CourtCanvas**:
- SVG con fondo de pista (`CourtBackground`)
- Coordenadas normalizadas [0,1] internamente
- Drag desde paleta → crea elemento
- Click → selecciona elemento
- Drag de elemento seleccionado → mueve
- Tecla Delete → borra seleccionado
- Escape → deselecciona / cancela dibujado de línea
- Doble click → termina dibujo de línea

**Panel derecho — tabs**:

*Tab "Propiedades"* (`PropertiesPanel`):
- Cambia según tipo de elemento seleccionado
- Jugador: número, color (team A / team B)
- Línea de movimiento: color, tipo de línea (sólida / discontinua / con flecha)
- Sin selección: texto de ayuda

*Tab "Secuencias"* (`SequenceTreePanel`):
- Árbol de nodos de secuencia (SequenceNode)
- Click en nodo → carga el estado del canvas de ese nodo
- Botón añadir hijo
- Botón eliminar nodo (y subárbol)

**Historial undo/redo**: gestionado por `useUndoRedo` hook, 50 pasos máx.

---

### 5.14 Catálogo del club (`/clubs/[clubId]/catalog`)

**Qué muestra**: lista de ejercicios/jugadas publicados en el catálogo del club activo.

**Cada entrada muestra**: badge tipo, nombre, badge "Desvinculado" si el original fue archivado, tags.

**Acciones**:
- Todos los miembros: "Copiar a mi biblioteca" (`BookCopy`)
- Autor o Tech Director: "Actualizar copia" (`RefreshCw`), "Retirar del catálogo" (`Trash2`)

**Botón "Publicar"** (miembros con permiso):
- Dialog: selector de drill de la biblioteca personal + selector de tags del club (checkboxes)

**Tags del club**: gestionables por Tech Director (crear/editar/archivar) desde la misma pantalla.

---

## 6. Componentes reutilizables

### 6.1 VideoCard

**Archivo**: `components/video/VideoCard.tsx`

**Props**: `video: Video`, callbacks `onRetry`, `onDelete`

**Muestra**:
- Thumbnail área `aspect-video bg-muted` (sin imagen real, solo placeholder)
- Overlay con badge de estado
- Título, fecha de subida
- Botones de acción en hover

**Badge de estado**:

| Status | Variante badge | Texto |
|---|---|---|
| `uploading` | `secondary` | Subiendo |
| `pending` | `secondary` | En cola |
| `processing` | `secondary` | Procesando |
| `completed` | `default` | Completado |
| `error` | `destructive` | Error |

---

### 6.2 ClipCard

**Archivo**: `components/video/ClipCard.tsx`

**Props**: `clip: Clip`, `videoId: string`

**Muestra**:
- Área `aspect-video bg-muted` clickable → `/videos/[videoId]/clips/[clip.id]`
- Badge de equipo (team_label del clip)
- Duración en formato `m:ss`

---

### 6.3 VideoUploader

**Archivo**: `components/video/VideoUploader.tsx`

**Props**: `onFileSelect: (file: File) => void`, `accept?: string`

**Muestra**:
- Zona drag-and-drop con borde dashed
- Icono de upload + texto instructivo
- Input `<input type="file" hidden>`
- Al seleccionar archivo: nombre y tamaño del archivo

**Validación**: solo archivos de vídeo (`video/*`).

---

### 6.4 FloatingUploadWidget

**Archivo**: `components/video/FloatingUploadWidget.tsx`

**Cuándo se muestra**: cuando `uploadJob !== null` y la ruta actual no es `/upload`.

**Posición**: `fixed bottom-4 right-4 z-50`

**Collapsa/expande** con botón chevron.

**Expandido muestra**:
- Nombre del archivo
- Estado actual (fase: upload, processing, done, error)
- `<Progress>` si está en progreso
- Botón "Ver resultado" si `done`
- Botón "Cerrar" siempre

---

### 6.5 ProcessingStatus

**Archivo**: `components/video/ProcessingStatus.tsx`

**Props**: `status: VideoStatus`, `processingPercent?: number`, `processingStatus?: string`

**Muestra**: stepper con 3 fases:
1. "Subida completada" ✓
2. "Detectando posesiones" (con progress bar si está activo)
3. "Generando clips"

---

### 6.6 DeleteVideoDialog

**Archivo**: `components/video/DeleteVideoDialog.tsx`

**Props**: `videoId: string`, `onDeleted: () => void`

**Patrón**: dialog de confirmación destructiva. Botón "Eliminar" llama a `deleteVideo(videoId)`, luego `onDeleted()`.

---

### 6.7 DrillEditor y sub-componentes

**Archivo principal**: `components/drill-editor/DrillEditor.tsx`

Sub-componentes en el mismo directorio:

| Componente | Responsabilidad |
|---|---|
| `CourtCanvas.tsx` | Canvas SVG interactivo, gestión de eventos de ratón |
| `CourtBackground.tsx` | SVG estático con las líneas de la pista |
| `ElementPalette.tsx` | Panel izquierdo con elementos arrastrables |
| `ElementRenderer.tsx` | Renderiza cada tipo de elemento en el SVG |
| `PropertiesPanel.tsx` | Panel de propiedades del elemento seleccionado |
| `SequenceTreePanel.tsx` | Panel de árbol de nodos de secuencia |
| `court-utils.ts` | Constantes y conversores de coordenadas |
| `tree-utils.ts` | CRUD inmutable del árbol de nodos |

---

## 7. Patrones de UX recurrentes

### 7.1 Formularios en modal

**Patrón estándar para crear/editar**:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Crear jugador</DialogTitle>
    </DialogHeader>
    
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="first_name">Nombre</Label>
        <Input id="first_name" value={...} onChange={...} />
      </div>
      {/* más campos */}
    </div>
    
    {error && (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      <Button onClick={handleSubmit} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Guardar
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Regla**: siempre `<Label>` + `<Input>` dentro de `<div className="space-y-2">`, agrupar campos en `<div className="space-y-4">`.

---

### 7.2 Confirmaciones destructivas

Para acciones irreversibles (borrar, archivar):

```tsx
// Patrón 1: AlertDialog (shadcn/ui)
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Eliminar</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

// Patrón 2: Dialog custom (DeleteVideoDialog)
// Usado cuando se necesita más lógica o estados internos
```

---

### 7.3 Estados de carga (Skeleton)

**Skeleton de grid de cards**:
```tsx
{isLoading && (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="aspect-video rounded-lg" />
    ))}
  </div>
)}
```

**Skeleton de tabla**:
```tsx
{isLoading && Array.from({ length: 5 }).map((_, i) => (
  <tr key={i}>
    <td><Skeleton className="h-8 w-8 rounded-full" /></td>
    <td><Skeleton className="h-4 w-32" /></td>
    {/* ... */}
  </tr>
))}
```

**Spinner en botón** (durante operación async):
```tsx
<Button disabled={isPending}>
  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Guardar
</Button>
```

---

### 7.4 Errores

**Error inline** (dentro de formularios o dialogs):
```tsx
<Alert variant="destructive">
  <AlertDescription>{errorMessage}</AlertDescription>
</Alert>
```

**Error en página** (query fallida):
- Texto descriptivo en el área de contenido
- Botón "Reintentar" si aplica

**Regla**: los errores se muestran ENCIMA del botón de submit, DENTRO del modal/card donde ocurrió la acción.

---

### 7.5 Feedback de acciones exitosas

No hay toasts implementados. El feedback es implícito:
- El dialog se cierra
- La lista se invalida vía `queryClient.invalidateQueries()`
- Los datos nuevos aparecen tras el re-fetch

**Nota de mejora**: implementar toasts con `sonner` o similar para acciones que no tienen feedback visual inmediato obvio.

---

### 7.6 Empty states

Patrón consistente:
```tsx
<div className="text-center py-12 text-muted-foreground">
  <p>Todavía no tienes vídeos.</p>
  <Button variant="link" asChild>
    <Link href="/upload">Sube tu primer vídeo</Link>
  </Button>
</div>
```

---

### 7.7 Auto-refresh condicional

Para datos que cambian en tiempo real (videos en procesado):
```tsx
const { data: videos } = useQuery({
  queryKey: ["videos"],
  queryFn: listVideos,
  refetchInterval: videos?.some(v =>
    ["uploading", "pending", "processing"].includes(v.status)
  ) ? 5000 : false,
})
```

---

### 7.8 Acciones en hover de tabla/lista

Patrón para mostrar acciones contextuales sin saturar la UI:
```tsx
<tr className="group">
  <td>...</td>
  <td className="opacity-0 group-hover:opacity-100 transition-opacity">
    <Button variant="ghost" size="icon" onClick={handleEdit}>
      <Pencil className="h-4 w-4" />
    </Button>
    <Button variant="ghost" size="icon" onClick={handleDelete}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  </td>
</tr>
```

---

### 7.9 Badges de tipo/estado

Reglas de color por convención:

| Contenido | Variante |
|---|---|
| Estado completado, tipo principal | `default` (primary) |
| Estado neutro, tipo secundario | `secondary` |
| Estado en progreso, neutral | `secondary` |
| Error, archivado, acción destructiva | `destructive` |
| Etiqueta informativa, readonly | `outline` |
| ROL: DT | `default` |
| ROL: Coach | `secondary` |
| ROL: Staff | `outline` |
| TIPO: Play (Jugada) | `default` |
| TIPO: Drill (Ejercicio) | `secondary` |

---

### 7.10 Acciones condicionadas por rol

La visibilidad de acciones (botones, opciones) se condiciona en el cliente comparando el `activeProfile.role` o el `userId` del autor:

```tsx
// Solo el autor puede editar
{drill.created_by === user?.id && (
  <Button onClick={() => router.push(`/drills/${drill.id}/edit`)}>
    Editar
  </Button>
)}

// Solo Tech Director puede gestionar tags del club
{activeProfile?.role === "technical_director" && (
  <Button onClick={handleCreateTag}>Crear tag</Button>
)}
```

---

## 8. Flujos de usuario principales

### 8.1 Flujo de login y selección de perfil

```
/login
  → submit email + password
  → POST /auth/login → JWT
  → hydrateFromToken(): GET /auth/me + GET /profiles (paralelo)
  → si profile_id en JWT → redirige a /
  → si no → redirige a /select-profile
      → click en perfil → POST /auth/switch-profile → nuevo JWT
      → redirige a /
```

### 8.2 Flujo de subida de vídeo

```
/upload
  → rellenar título + arrastrar archivo
  → click "Procesar vídeo"
  → POST /videos/init-upload → { videoId, presignedUrls }
  → browser sube partes a S3 (4 paralelas) → progress en UI
  → POST /videos/{id}/complete-upload → Celery encola job
  → WebSocket /ws/{videoId} → actualizaciones de progreso
  → si usuario navega: FloatingUploadWidget sigue el progreso
  → status "completed" → botón "Ver clips"
  → /videos/{id} → grid de clips generados
```

### 8.3 Flujo de edición de drill/jugada

```
/drills
  → click "Nuevo" → dialog crear → POST /drills → /drills/{id}/edit
  → o click en drill existente → /drills/{id}/edit

/drills/{id}/edit
  → toolbar: modificar nombre, layout
  → paleta: arrastrar elementos al canvas
  → canvas: seleccionar, mover, eliminar elementos
  → propiedades: ajustar color, tipo de elemento
  → secuencias: navegar árbol, añadir nodos hijo
  → Ctrl+S / botón Save → PATCH /drills/{id}
  → botón Back (con confirm si dirty) → /drills
```

### 8.4 Flujo de publicación al catálogo

```
/drills
  → crear/editar drill hasta tener versión publicable

/clubs/{clubId}/catalog
  → click "Publicar"
  → dialog: seleccionar drill de biblioteca personal
  → seleccionar tags del club (checkboxes)
  → submit → POST /clubs/{id}/catalog
  → entrada aparece en el catálogo

Otros miembros:
  → ven la entrada en el catálogo
  → click "Copiar a mi biblioteca" → POST /clubs/{id}/catalog/{entry_id}/copy-to-library
  → drill aparece en su /drills con badge "Desde catálogo"
```

### 8.5 Flujo de gestión de plantilla

```
/players (Tech Director / Head Coach)
  → añadir jugadores al club
  → asignar posición y fecha de nacimiento

/teams/{teamId}/roster
  → "Añadir jugador" → dialog: elegir de jugadores del club
  → asignar dorsal y posición
  → editar: actualizar stats (ppg, rpg, apg, mpg)
  → eliminar de plantilla (sin archivar al jugador)
```

### 8.6 Flujo de cambio de perfil

```
Navbar → ProfileSelector dropdown
  → click en perfil diferente
  → POST /auth/switch-profile → nuevo JWT con profile_id actualizado
  → Navbar se actualiza: links filtrados por nuevo club_id / team_id
  → sin recarga de página

Navbar → "Cambiar de club"
  → POST /auth/clear-profile → JWT sin profile_id
  → redirige a /select-profile
```

---

## 9. Gaps y mejoras detectadas

### 9.1 Pantallas no implementadas

| Pantalla | Justificación |
|---|---|
| Gestión de clubs (admin) | Solo existe la API; no hay UI para crear/editar clubs |
| Gestión de temporadas | Solo existe la API; Tech Director no puede gestionar temporadas desde la web |
| Gestión de equipos | Solo existe la API; no hay UI para crear equipos dentro de un club |
| Dashboard de admin | Sin UI para gestión de usuarios y clubs a nivel plataforma |
| Perfil de usuario | Sin página de configuración de cuenta (cambio de contraseña, etc.) |

### 9.2 Feedback de acciones exitosas

No existen toasts ni notificaciones. Tras una mutación exitosa, el feedback es implícito (el dialog se cierra). Recomendado: implementar `sonner` (compatible con shadcn/ui) para mensajes de éxito/error globales. Patrón propuesto:
```tsx
toast.success("Jugador añadido correctamente")
toast.error("No se pudo guardar. Intenta de nuevo.")
```

### 9.3 Validación de formularios

La validación es manual (comparaciones en el submit handler). Para pantallas nuevas se recomienda integrar `react-hook-form` + `zod`, que ya son compatibles con shadcn/ui y reducen el boilerplate:
```tsx
const schema = z.object({ name: z.string().min(3) })
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
```

### 9.4 Manejo de errores de API

Los errores de la API (`ApiError`) no se parsean de forma consistente en todos los formularios. Algunos muestran el mensaje raw, otros un genérico. Estandarizar extrayendo el mensaje del body:
```tsx
catch (e) {
  setError(e instanceof ApiError ? e.message : "Error inesperado")
}
```

### 9.5 Accesibilidad

- Algunos botones de icono (`<Button size="icon">`) carecen de `aria-label`
- El `<DeleteVideoDialog>` no usa el componente `<AlertDialog>` de shadcn/ui (inconsistencia)
- Formularios sin `aria-describedby` para mensajes de error

Patrón correcto para botones de icono:
```tsx
<Button size="icon" aria-label="Eliminar jugador">
  <Trash2 className="h-4 w-4" />
</Button>
```

### 9.6 Responsive del editor

El `DrillEditor` tiene un layout de 3 columnas que puede quedar muy comprimido en tablets (768–1024px). Considerar un modo compacto donde los paneles laterales sean drawers deslizables.

### 9.7 Ausencia de modo oscuro en algunos componentes

El `bg-zinc-950` de la Navbar es hardcoded y no responde al toggle de dark mode vía la clase `dark`. Si se implementa dark mode completo, la Navbar debe refactorizarse para usar tokens semánticos.

### 9.8 Gestión de temporadas activas desde UI

La API de temporadas está completa pero no existe ninguna pantalla que permita al Tech Director crear o cambiar el estado de las temporadas. La Fase F necesitará esto si introduce estadísticas por temporada.

---

## Checklist para nuevas pantallas (Fase F)

Al implementar una pantalla nueva, verificar:

- [ ] Envuelta en `<PageShell requireAuth requireProfile>` si requiere perfil activo
- [ ] Skeleton de loading con la misma estructura que el contenido real
- [ ] Empty state con texto descriptivo y acción principal
- [ ] Error de query con `<Alert variant="destructive">`
- [ ] Formularios en `<Dialog>` con error inline y spinner en botón de submit
- [ ] Acciones destructivas con `<AlertDialog>` de confirmación
- [ ] Acciones condicionadas por rol en el cliente
- [ ] `queryClient.invalidateQueries()` tras mutaciones exitosas
- [ ] Auto-refresh solo cuando el estado lo requiere (evitar polling innecesario)
- [ ] Botones de icono con `aria-label`
- [ ] Grid responsivo: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- [ ] Consistencia de badges: variante correcta según tipo/estado (ver § 7.9)
