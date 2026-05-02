# Aplicación de Gestión de Clubs de Baloncesto — Requisitos

> **Propósito de este documento.** Este archivo describe el modelo de dominio, los actores y las reglas de negocio de la aplicación. Está pensado para ser usado como contexto persistente por Claude Code y por cualquier persona que se incorpore al proyecto. Cuando exista discrepancia entre este documento y el código, **este documento es la fuente de verdad** salvo que se actualice explícitamente.
>
> **Cómo está estructurado.** El documento se divide en bloques temáticos. Cada bloque tiene una sección de _Decisiones cerradas_ (los requisitos vigentes) y, cuando aplica, una sección de _Decisiones aplazadas_ (puntos identificados pero pendientes de definir). Los requisitos están numerados con identificadores estables (`RF-XXX` para funcionales, `RN-XXX` para reglas de negocio, `RD-XXX` para requisitos de datos). **Estos identificadores no deben cambiar** una vez asignados; si un requisito se invalida, se marca como _Deprecado_ pero se conserva.
>
> **Apéndices al final.** Los apéndices recogen flujos de usuario y recomendaciones de implementación. Son **orientativos**: la tecnología y arquitectura del proyecto prevalecen sobre cualquier recomendación de los apéndices.

---

## 1. Glosario

Términos canónicos del dominio. Usar estos nombres (en inglés) en el código para mantener consistencia.

| Término (ES)            | Término canónico (EN)  | Definición                                                                                                                              |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Usuario                 | `User`                 | Identidad única autenticable con email/usuario y contraseña. No tiene rol intrínseco.                                                   |
| Administrador           | `Admin`                | Usuario con permisos globales sobre toda la plataforma. Externo al modelo de clubs.                                                     |
| Club                    | `Club`                 | Unidad organizativa principal. Agrupa equipos, miembros y temporadas.                                                                   |
| Director técnico        | `TechnicalDirector`    | Rol a nivel de club. Gestiona equipos, plantillas de personas y temporadas del club.                                                    |
| Entrenador              | `HeadCoach`            | Rol a nivel de equipo. Responsable principal del equipo.                                                                                |
| Cuerpo técnico          | `StaffMember`          | Rol a nivel de equipo. Colaboradores del entrenador (delegado, ayudante, etc.).                                                         |
| Miembro de club         | `ClubMember`           | Persona vinculada a un club con acceso al mismo, con cero o más perfiles activos en sus equipos.                                        |
| Perfil                  | `Profile`              | Asignación específica de una persona a un equipo en un rol concreto. Un usuario puede tener varios perfiles simultáneamente.            |
| Jugador                 | `Player`               | Entidad gestionada en el club. **No es un usuario** de la aplicación.                                                                   |
| Equipo                  | `Team`                 | Conjunto de jugadores y staff dentro de una temporada. Pertenece a un club y a una temporada.                                           |
| Temporada               | `Season`               | Período temporal que agrupa equipos, plantillas, partidos, etc. de un club.                                                             |
| Ejercicio               | `Drill`                | Unidad de entrenamiento creada por un usuario. Vive en su biblioteca personal.                                                          |
| Jugada                  | `Play`                 | Esquema táctico creado por un usuario. Mismo modelo que `Drill` en cuanto a propiedad y compartición.                                   |
| Variante                | `Variant`              | Jugada o ejercicio derivado de otro padre, con referencia explícita al original. Puede tener sus propias variantes.                     |
| Nodo de secuencia       | `SequenceNode`         | Nodo del árbol interno de una jugada/ejercicio. Representa un estado completo de la cancha en un momento dado.                          |
| Elemento de sketch      | `SketchElement`        | Elemento dibujable sobre la cancha (jugador, balón, línea, anotación...).                                                               |
| Línea de movimiento     | `MovementLine`         | Subtipo de `SketchElement` que representa pases, movimientos, dribles, bloqueos o tiros.                                                |
| Categoría / Tag         | `Tag`                  | Etiqueta libre y opcional usada para agrupar jugadas/ejercicios. No jerárquica. Una jugada/ejercicio puede tener cero o más tags.       |
| Layout de cancha        | `CourtLayoutType`      | Configuración de la cancha sobre la que se dibuja una jugada/ejercicio (`full_fiba`, `half_fiba`, `mini_fiba`, `half_mini_fiba`).       |
| Catálogo del club       | `ClubCatalog`          | Conjunto de ejercicios y jugadas que han sido publicados al club por sus miembros. Gestionado por el director técnico.                  |
| Archivar                | `archive`              | Soft-delete. La entidad deja de aparecer en listas activas pero se conserva. Las referencias históricas siguen visibles como tales.     |
| Biblioteca personal     | `PersonalLibrary`      | Colección privada de ejercicios y jugadas de un `User`. Transversal a clubs, equipos, perfiles y temporadas.                            |
| Playbook del equipo     | `TeamPlaybookEntry`    | Vínculo entre una jugada/ejercicio y un equipo. La jugada/ejercicio sigue siendo del autor; el equipo la usa.                           |

---

## 2. Actores del sistema

### 2.1 Decisiones cerradas

- **RF-001.** El sistema reconoce los siguientes actores: `Admin`, `TechnicalDirector`, `HeadCoach`, `StaffMember`, `Player`.
- **RF-002.** `Player` no es un actor con acceso al sistema. Es una entidad gestionada por otros actores. No autentica, no tiene credenciales.
- **RF-003.** Un `User` autenticado no posee un rol intrínseco. Sus roles se derivan de los perfiles que tenga asignados en uno o más clubs.
- **RF-004.** Un mismo `User` puede tener perfiles en distintos clubs simultáneamente y con roles distintos en cada uno (ej. `HeadCoach` en el club A y `TechnicalDirector` en el club B).
- **RF-005.** Un mismo `User` puede tener varios perfiles dentro del mismo club (ej. `TechnicalDirector` del club + `HeadCoach` de un equipo + `StaffMember` de otro equipo).
- **RF-006.** Los permisos efectivos de un usuario en un club se calculan como la unión de los permisos de todos sus perfiles activos en ese club.

---

## 3. Modelo de acceso y perfiles

### 3.1 Decisiones cerradas

#### Selector de perfil

- **RF-010.** El usuario ve un selector de perfil siempre visible en la barra superior de la aplicación.
- **RF-011.** Cada perfil del usuario aparece como una entrada independiente en el selector. La granularidad mínima del perfil es **(Club, Equipo o nivel-club, Rol, Temporada)**.
- **RF-012.** Ejemplos de perfiles independientes para un mismo usuario:
  - "Director técnico — Club A — Temporada 25/26"
  - "Entrenador — Equipo Senior A — Club A — Temporada 25/26"
  - "Entrenador — Equipo Junior B — Club A — Temporada 25/26"
  - "Cuerpo técnico — Equipo Senior A — Club B — Temporada 25/26"
- **RF-013.** Al iniciar sesión, el usuario aterriza en una vista que separa la información por perfil y le permite seleccionar en cuál entrar. _(Detalle del dashboard aplazado — ver §11.)_
- **RF-014.** Cambiar de perfil no requiere cerrar sesión.

#### Administrador

- **RF-020.** El `Admin` accede a un dashboard independiente del resto de la aplicación.
- **RF-021.** El `Admin` puede operar sobre el backend para corregir datos o realizar configuraciones.
- **RF-022.** El `Admin` es el único actor capaz de crear un `Club` (ver RF-030).
- **RF-023.** El `Admin` es el único actor capaz de asignar y retirar el rol de `TechnicalDirector` en un club.

### 3.2 Decisiones aplazadas

- **RD-001.** Funcionalidad de "impersonación" del administrador (entrar como un usuario para ver lo que ve). Se omite por ahora.
- **RD-002.** Mecanismo de autoservicio para creación de clubs. Por ahora la creación es manual por un administrador, gestionada de forma personal/hablada.

---

## 4. Estructura de club

### 4.1 Decisiones cerradas

#### Creación y dirección del club

- **RF-030.** Un `Club` solo puede ser creado por un `Admin`.
- **RF-031.** Al crear un `Club`, el `Admin` asigna al menos un `TechnicalDirector` inicial.
- **RF-032.** Un `Club` puede tener uno o más `TechnicalDirector` simultáneamente.
- **RF-033.** Si un `TechnicalDirector` es retirado por el `Admin`, el club sigue funcionando con normalidad, **incluso si el club queda temporalmente sin ningún `TechnicalDirector`**. Las funcionalidades que requieren un `TechnicalDirector` quedarán bloqueadas hasta que se asigne uno nuevo.

#### Miembros del club

- **RF-040.** Un `ClubMember` es una persona con acceso al club que puede tener cero o más perfiles activos en sus equipos.
- **RF-041.** Solo un `TechnicalDirector` puede añadir `ClubMember` al club (ya sea como futuro `HeadCoach` o como `StaffMember`).
- **RF-042.** Un `ClubMember` puede no estar asignado a ningún equipo y seguir siendo miembro del club ("flotante").
- **RF-043.** Un mismo `ClubMember` puede tener varios perfiles dentro del club: por ejemplo, `HeadCoach` de un equipo y `StaffMember` de otro.
- **RF-044.** Un `TechnicalDirector` también puede asumir simultáneamente roles de `HeadCoach` o `StaffMember` en equipos del propio club.

#### Asignación a equipos

- **RF-050.** Un `TechnicalDirector` puede asignar un `ClubMember` como `HeadCoach` o `StaffMember` de cualquier equipo del club.
- **RF-051.** Un `HeadCoach` puede añadir `ClubMember` como `StaffMember` de su propio equipo.
- **RF-052.** Tanto el `TechnicalDirector` como el `HeadCoach` correspondiente pueden retirar la asignación de una persona a un equipo.
- **RF-053.** Retirar una asignación a un equipo **no expulsa** a la persona del club. Sigue siendo `ClubMember` con los demás perfiles que tuviera, o queda sin perfiles activos.

### 4.2 Reglas de negocio

- **RN-001.** Un `Club` siempre debería tener al menos un `TechnicalDirector` para poder evolucionar (crear equipos, gestionar temporadas, etc.). Cuando no lo tiene, el club entra en un estado degradado pero no se elimina.
- **RN-002.** El conjunto de `HeadCoach` y `StaffMember` de un equipo nunca puede ser modificado por personas ajenas al club.

---

## 5. Equipos

### 5.1 Decisiones cerradas

- **RF-060.** Un `Team` pertenece a un `Club` y a una `Season` concreta.
- **RF-061.** Un `Team` tiene exactamente un `HeadCoach` asignado en cada momento (puede cambiar a lo largo de la temporada).
- **RF-062.** Un `Team` puede tener cero o más `StaffMember` asignados.
- **RF-063.** Un `HeadCoach` puede ser responsable de más de un `Team` simultáneamente. Cada equipo le aparece como un perfil independiente en el selector.
- **RF-064.** Un `StaffMember` puede pertenecer al cuerpo técnico de varios equipos del mismo club simultáneamente.
- **RF-065.** Un `Team` puede ser archivado.
- **RF-066.** Solo el `TechnicalDirector` puede crear, archivar o cambiar el `HeadCoach` de un `Team`.

### 5.2 Decisiones aplazadas

- **RD-010.** Detalles de configuración del equipo (categoría, nombre, color, etc.) — pendiente de definir junto con la gestión de jugadores.

---

## 6. Permisos del cuerpo técnico

### 6.1 Decisiones cerradas

- **RF-070.** En la versión inicial, un `StaffMember` tiene los **mismos permisos generales** que el `HeadCoach` del equipo en cuanto a funcionalidades del equipo (añadir jugadores, registrar partidos, gestionar entrenamientos, etc.).
- **RF-071.** La arquitectura debe estar preparada para que en una iteración futura el `HeadCoach` pueda configurar permisos granulares para cada `StaffMember` del equipo.
- **RF-072.** El modelo previsto para los permisos granulares es una **matriz funcionalidad × nivel de acceso**, donde:
  - Las **funcionalidades** son: jugadores, ejercicios, jugadas, partidos, estadísticas, entrenamientos (lista no exhaustiva, ampliable).
  - Los **niveles de acceso** son: ninguno, lectura, lectura + añadir, lectura + escritura completa.
- **RF-073.** El `HeadCoach` puede archivar (retirar el acceso de) un `StaffMember` de su equipo. Esto retira esa asignación concreta sin afectar otros perfiles que la persona tenga en el club.

### 6.2 Excepción importante: autoría de jugadas y ejercicios

- **RF-074.** La igualdad de permisos `HeadCoach`/`StaffMember` (RF-070) **no aplica a la edición de jugadas y ejercicios**. La edición de un `Drill` o `Play` está siempre restringida a su autor (ver §9.5).
- **RF-075.** Cualquier persona con un perfil activo en un equipo (`HeadCoach`, `StaffMember`, o `TechnicalDirector` actuando como tal) puede:
  - Añadir jugadas/ejercicios al `TeamPlaybook` desde su propia `PersonalLibrary`.
  - Consultar todas las jugadas/ejercicios del `TeamPlaybook`, sea cual sea su autor.
  - Editar únicamente las jugadas/ejercicios de los que es autor.

### 6.3 Reglas de negocio

- **RN-010.** Hasta que se implemente el sistema granular de permisos (RF-071), todas las acciones que pueda hacer un `HeadCoach` sobre su equipo, las puede hacer también cualquier `StaffMember` del mismo equipo, **excepto la edición de jugadas/ejercicios de otros autores** (RF-074).

---

## 7. Soft-delete y archivado

### 7.1 Decisiones cerradas

- **RF-080.** Todas las operaciones de "borrado" en la aplicación son soft-delete (archivado). La entidad se conserva en base de datos pero deja de aparecer en listas y vistas activas.
- **RF-081.** El borrado físico (hard-delete) solo puede ser ejecutado por un `Admin`.
- **RF-082.** Las entidades archivadas siguen apareciendo en referencias históricas con una marca explícita (ej. "jugador archivado") cuando son referenciadas desde datos que sí están activos.
- **RF-083.** Entidades archivables: `Player`, `Team`, `ClubMember` (a nivel de club), `Drill`, `Play`, `Tag`, asignaciones de personas a equipos, `Season`.

### 7.2 Comportamiento del archivado de jugadores

- **RF-090.** Archivar un `Player` lo retira de las plantillas activas de **todos** sus equipos.
- **RF-091.** Sus datos personales y deportivos se conservan ocultos.
- **RF-092.** En referencias históricas (ej. estadísticas de un partido pasado) aparece como "jugador archivado" en lugar de su nombre real, manteniendo la integridad referencial.

> Nota: la frase exacta que se mostrará en lugar del nombre y los datos visibles en referencias históricas es una **decisión aplazada** y se afinará al desarrollar la gestión de jugadores (ver §11).

---

## 8. Temporadas

### 8.1 Decisiones cerradas

- **RF-100.** Una `Season` pertenece a un `Club`.
- **RF-101.** En cada `Club` solo puede haber **una `Season` activa** en un momento dado.
- **RF-102.** El `TechnicalDirector` puede trabajar sobre temporadas futuras (crearlas, configurar equipos, asignar staff, etc.) mientras la temporada actual sigue activa.
- **RF-103.** El `TechnicalDirector` decide cuándo activar una nueva temporada (cambia el estado de "futura" a "activa") y cuándo archivar una temporada anterior.
- **RF-104.** Un `Team` pertenece a una única `Season`. Cuando llega una nueva temporada, se crean equipos nuevos para esa temporada (no se reutilizan los anteriores).

### 8.2 Datos transversales vs. datos por temporada

- **RD-020.** Datos que viven a **nivel de club** (transversales a temporadas):
  - El propio `Club` y sus `TechnicalDirector`.
  - Los `ClubMember` (personas con acceso al club).
  - Los datos personales de los `Player` (nombre, fecha de nacimiento, contacto familiar, etc. — _detalle aplazado_).
  - El `ClubCatalog` de ejercicios y jugadas.
- **RD-021.** Datos que viven a **nivel de temporada**:
  - Los `Team`.
  - Las asignaciones de `HeadCoach` y `StaffMember` a cada `Team`.
  - Las plantillas (qué `Player` pertenece a qué `Team`).
  - Los datos deportivos del jugador en cada equipo (dorsal, posición, estadísticas, etc.).
  - Los partidos, entrenamientos y demás eventos.
  - El `TeamPlaybook` (vinculaciones de jugadas/ejercicios al equipo).

### 8.3 Decisiones aplazadas

- **RD-030.** Mecanismo y UX de creación de temporadas, incluyendo posibles funcionalidades de "clonar configuración de la temporada anterior".
- **RD-031.** Reglas detalladas de transición entre temporadas (qué se conserva, qué se reinicia).
- **RD-032.** Visualización del histórico de un jugador a lo largo de varias temporadas y equipos.

---

## 9. Ejercicios y jugadas

> Esta sección aplica por igual a `Drill` (ejercicios) y `Play` (jugadas). Comparten estructura, modelo de propiedad, herramienta de edición y reglas de compartición. La única diferencia es el campo `type` que los distingue. Cuando se diga "ejercicio" en esta sección, léase "ejercicio o jugada".

### 9.1 Identidad y propiedad

- **RF-110.** Cada `User` tiene una `PersonalLibrary` propia de ejercicios y jugadas. Es **transversal a clubs, equipos, perfiles y temporadas**: si el usuario participa en varios clubs o equipos, su biblioteca es la misma.
- **RF-111.** Un ejercicio o jugada **pertenece siempre a un único `User` (su autor)**. La autoría no se transfiere.
- **RF-112.** Cada `Drill` y cada `Play` tiene un identificador único en el sistema (`id`, ej. UUID) que el backend usa para referenciar la entidad en cualquier contexto.
- **RF-113.** El **nombre no es único**. Un mismo usuario puede tener varios ejercicios o jugadas con el mismo nombre. El sistema distingue siempre por `id`, no por nombre.
- **RF-114.** Cada `Club` tiene un `ClubCatalog` de ejercicios y jugadas, alimentado por publicaciones que hacen los miembros del club desde sus bibliotecas personales.

### 9.2 Categorías (tags)

- **RF-115.** Las categorías se modelan como `Tag`: etiquetas libres, no jerárquicas, opcionales.
- **RF-116.** Un `Drill` o `Play` puede tener cero o más `Tag` asociados.
- **RF-117.** Existen **dos planos** de tags:
  - **Tags personales del usuario**, vivos en su `PersonalLibrary`.
  - **Tags del club**, vivos en el `ClubCatalog` y gestionados por el `TechnicalDirector`.
- **RF-118.** Los tags de un usuario son independientes de los tags del club. No se sincronizan automáticamente.
- **RF-119.** Un usuario puede gestionar libremente sus propios tags (crear, renombrar, asignar color, archivar). El `TechnicalDirector` gestiona los tags del club. _(Detalle de gestión de tags del club aplazado.)_

### 9.3 Vinculación con equipos — `TeamPlaybook`

- **RF-160.** Cualquier persona con un perfil activo en un equipo (`HeadCoach`, `StaffMember`, `TechnicalDirector` actuando como tal) puede añadir ejercicios o jugadas **de su propia `PersonalLibrary`** al `TeamPlaybook` de ese equipo.
- **RF-161.** El `TeamPlaybook` es la lista de jugadas/ejercicios usados por un equipo en una temporada concreta. Cada entrada (`TeamPlaybookEntry`) es un vínculo entre un `Drill`/`Play` y un `Team`. **No es una copia**: la jugada/ejercicio sigue siendo el mismo objeto que vive en la biblioteca personal del autor.
- **RF-162.** Editar un ejercicio/jugada en la biblioteca personal del autor afecta también a su versión en el equipo (y viceversa, son la misma entidad).
- **RF-163.** Si un mismo ejercicio/jugada está vinculado a **varios equipos** del autor, al editarlo el sistema pregunta al usuario:
  - **Opción A — Aplicar a todos los equipos**: el cambio se persiste sobre la entidad y afecta a todos los equipos donde está vinculada.
  - **Opción B — Crear copia para este equipo**: se genera una copia (nueva entidad con nuevo `id`) en la biblioteca del autor, vinculada únicamente al equipo desde el que se está editando. El original se mantiene intacto en los demás equipos.
- **RF-164.** Cuando un usuario **deja de tener perfil en un equipo** (se le retira el rol como `HeadCoach`, `StaffMember`, etc.):
  - Las entradas del `TeamPlaybook` que aportó al equipo se transforman en **copias congeladas** propiedad del equipo (no del autor anterior). El equipo conserva el contenido pero pierde el vínculo vivo con la biblioteca del autor saliente.
  - El autor saliente conserva intacta su versión en su `PersonalLibrary`.
  - Esta regla es paralela a RF-124 (ruptura de referencia con el catálogo del club).
- **RF-165.** Archivar un `Drill` o `Play` en la `PersonalLibrary` del autor lo archiva **también en todos los equipos** donde está vinculado.
- **RF-166.** Existe una acción separada **"quitar del equipo"** que retira un `Drill`/`Play` del `TeamPlaybook` sin archivarlo en la biblioteca personal del autor ni afectar a otros equipos donde esté vinculado.
- **RF-167.** Cualquier persona con perfil activo en un equipo puede **consultar todas** las entradas del `TeamPlaybook` del equipo, independientemente de quién sea el autor.
- **RF-168.** En la interfaz, las entradas del `TeamPlaybook` muestran un **indicador discreto de autoría** (avatar/iniciales del autor) y la **fecha de última modificación**.
- **RF-169.** Solo el autor de una entrada puede **editarla**. La acción "quitar del equipo" (RF-166) la puede ejecutar cualquier persona con perfil activo en el equipo, dado que retira la entrada del playbook del equipo sin afectar a la biblioteca personal del autor. _(Marcado para revisión: si se prefiere restringir esta acción al autor, se modificará en una iteración futura.)_

### 9.4 Compartir con el catálogo del club

- **RF-120.** Compartir un ejercicio con el `ClubCatalog` consiste en **publicar una copia** del ejercicio en el catálogo.
- **RF-121.** La copia en el catálogo mantiene una **referencia al original** en la biblioteca del autor.
- **RF-122.** Si el autor modifica el ejercicio en su biblioteca, los cambios **no se propagan automáticamente** al catálogo. El autor puede, opcionalmente, **publicar los cambios** explícitamente para actualizar la copia del catálogo.
- **RF-123.** Un autor puede **dejar de compartir** un ejercicio: la copia se retira del `ClubCatalog`.
- **RF-124.** Cuando un usuario deja de pertenecer al club (se le retira el último perfil que le ligaba al club), la referencia entre original y copia se rompe. La copia en el `ClubCatalog` se queda en su estado actual; la versión original en la biblioteca del autor sigue intacta. Ambas continúan vidas independientes.
- **RF-125.** Al compartir un ejercicio con el catálogo, el autor **elige explícitamente** a qué `Tag(s)` del club asociarlo (entre los existentes en el catálogo) o lo deja sin tag. Los tags personales del autor **no se replican** automáticamente al catálogo del club.

### 9.5 Edición y autoría

- **RF-126.** **Solo el autor** de un `Drill` o `Play` puede editar su contenido (sketch, secuencias, descripción, tags personales, nombre, etc.).
- **RF-127.** Otros usuarios **nunca** pueden modificar la biblioteca personal de otro usuario.
- **RF-128.** Los demás miembros de un equipo, club, o cualquier consumidor de un ejercicio del `ClubCatalog` solo pueden:
  - Consultarlo (lectura).
  - Copiarlo a su propia `PersonalLibrary` (RF-150 y siguientes).
  - Quitarlo de su contexto (del equipo, del catálogo del club, etc., según los permisos correspondientes).

### 9.6 Gestión del catálogo del club

- **RF-130.** El `TechnicalDirector` gestiona el `ClubCatalog`:
  - Puede retirar ejercicios del catálogo.
  - Puede prohibir a usuarios concretos publicar contenido en el catálogo.
  - Puede gestionar los `Tag` propios del club: crearlos, renombrarlos, archivarlos.
- **RF-131.** _(Aplazado)_ Otros mecanismos de moderación o curación del catálogo.

### 9.7 Variantes (entre ejercicios/jugadas distintos)

> **Importante.** Las variantes son una relación **entre ejercicios/jugadas distintos** del catálogo o biblioteca (ej. "este mismo ejercicio adaptado a 3v3 en lugar de 4v4"). No deben confundirse con las **ramas del árbol de secuencias internas** de una jugada (§9.9), que modelan decisiones tácticas durante la ejecución de una misma jugada.

- **RF-140.** Un ejercicio o jugada puede tener variantes (`Variant`).
- **RF-141.** Una variante es una versión **anidada** del ejercicio padre, con referencia explícita al mismo.
- **RF-142.** Una variante puede tener a su vez sus propias variantes (estructura recursiva).
- **RF-143.** Aunque las variantes están anidadas estructuralmente, en el buscador (tanto de la biblioteca personal como del catálogo del club) cada variante se indexa de forma independiente. Una búsqueda por un atributo concreto (ej. "3c3") puede devolver una variante sin devolver su ejercicio padre, y viceversa.
- **RF-144.** En la interfaz, al ver una variante se muestra de forma clara su linaje hasta el ejercicio raíz (estilo breadcrumb: `Ejercicio X → Variante 3c3 → Variante con presión`).

### 9.8 Copia y modificación entre usuarios

- **RF-150.** Cualquier usuario que pueda consultar un ejercicio del `ClubCatalog` puede **copiarlo** a su propia `PersonalLibrary`. La copia es una nueva entidad con nuevo `id` y autor el copiador.
- **RF-151.** Existe también una acción de **clonado interno**: un usuario puede duplicar un ejercicio dentro de su propia biblioteca personal para crear uno nuevo a partir de él. La copia es una nueva entidad con nuevo `id` y mismo autor.
- **RF-152.** Sobre cualquier copia en su biblioteca, el usuario puede crear variantes propias (RF-140 y siguientes).
- **RF-153.** Una variante creada por un usuario puede:
  - Permanecer privada en su `PersonalLibrary`.
  - Publicarse al `ClubCatalog` (siguiendo las reglas generales de compartición, RF-120 y siguientes).
- **RF-154.** Un usuario **nunca** puede modificar el ejercicio original creado por otro. Solo puede crear copias o variantes propias.

### 9.9 Estructura interna: árbol de secuencias

> Cada jugada o ejercicio tiene internamente un **árbol de secuencias** (`SequenceNode`), no una lista lineal. Esto permite modelar decisiones tácticas que abren caminos alternativos durante la ejecución de una misma jugada.

#### Modelo

- **RF-180.** Cada `Drill`/`Play` tiene un `rootSequence: SequenceNode` que representa el estado inicial.
- **RF-181.** Cada `SequenceNode` representa un estado completo de la cancha en un momento dado, con sus elementos (`SketchElement[]`) y posiciones.
- **RF-182.** Cada `SequenceNode` puede tener cero o más `branches: SequenceNode[]`. Un nodo sin ramas es un nodo hoja (fin de ese camino).
- **RF-183.** Las ramas pueden etiquetarse con texto libre (`label`) que describe la condición que las activa (ej. "Si el defensa cierra la línea de pase").
- **RF-184.** No existe un campo `order` numérico en los nodos. El orden y la jerarquía están implícitos en la estructura del árbol.

#### Identidad estable de jugadores entre nodos

- **RF-185.** Cada jugador presente en una jugada/ejercicio tiene un `playerId` que es **invariante a lo largo de todo el árbol** de esa jugada.
- **RF-186.** La posición (`x`, `y`) de un jugador puede cambiar entre nodos, pero su `playerId` no cambia.
- **RF-187.** Las líneas de movimiento de tipo `line_move` y `line_dribble` tienen un campo `ownerId` que referencia al `playerId` del jugador que ejecuta el movimiento.

#### Herencia de posición al crear un nuevo nodo hijo

- **RF-188.** Cuando se crea un nodo hijo a partir de un nodo padre, el sistema calcula automáticamente las posiciones iniciales:
  1. Para cada jugador del nodo padre que tenga una `MovementLine` (`line_move` o `line_dribble`) con `ownerId === playerId`, **el jugador se coloca en el punto final de esa línea** (`points[last]`) en el nuevo nodo.
  2. Los jugadores sin línea de movimiento asociada **mantienen su posición** del nodo padre.
  3. Las líneas de movimiento del padre **no se copian** al nuevo nodo.
  4. El resto de elementos (balones, pylons, anotaciones, líneas que no son de movimiento de jugador) **sí se copian** al nuevo nodo como punto de partida.

#### Gestión del árbol en la interfaz

- **RF-189.** Desde cualquier nodo del árbol el usuario puede añadir uno o más nodos hijo (ramas).
- **RF-190.** Eliminar un nodo elimina también todos sus descendientes. Si tiene hijos, requiere confirmación explícita.
- **RF-191.** El usuario puede editar la `label` de cualquier rama.
- **RF-192.** El panel de secuencias muestra el árbol de forma jerárquica (estructura expandible/colapsable). El nodo actualmente editado se resalta visualmente. Las ramas muestran su `label` si la tienen. Se indica visualmente si un nodo es hoja.
- **RF-193.** Al editar un nodo, el usuario puede activar opcionalmente la visualización de los elementos del nodo padre en color gris claro como referencia visual.

### 9.10 Sketch editor (herramienta de dibujo)

#### Modelo

- **RF-200.** Un `SketchElement` se compone de: `id`, `type`, posición normalizada (`x`, `y` en el rango `[0.0, 1.0]`), `rotation` (grados), `playerId` (cuando aplique), y propiedades específicas por tipo.
- **RF-201.** Las coordenadas se manejan en el rango normalizado `[0.0, 1.0]` para independencia de resolución. La conversión a píxeles es responsabilidad de la capa de renderizado.

#### Catálogo de elementos

- **RF-202.** El editor soporta los siguientes tipos de elementos:

  **Jugadores y personas:**
  - `player_offense` — jugador ofensivo (círculo con número, color configurable).
  - `player_defense` — jugador defensivo (triángulo u otro símbolo, color configurable).
  - `player_wheelchair` — jugador en silla de ruedas (rotable).
  - `player_arms` — jugador con brazos extendidos.
  - `coach` — entrenador (símbolo diferenciado de jugadores).

  **Objetos de cancha:**
  - `ball` — balón.
  - `ball_rack` — soporte con varios balones.
  - `pylon` — cono de entrenamiento.
  - `basket` — canasta (aro + tablero).

  **Líneas de movimiento (`MovementLine`):**
  - `line_pass` — pase (línea con flecha, trayectoria del balón).
  - `line_move` — movimiento de jugador (línea con flecha).
  - `line_dribble` — dribble (línea zigzag o discontinua).
  - `line_screen` — bloqueo/pantalla.
  - `line_shot` — tiro a canasta.

  **Formas y anotaciones:**
  - `ellipse` — elipse para marcar zonas.
  - `polygon` — polígono libre para marcar zonas.
  - `text` — texto anotado sobre el sketch.

#### Interacción

- **RF-210.** Los elementos se colocan arrastrando desde una paleta al canvas (drag & drop).
- **RF-211.** Los elementos colocados se pueden mover arrastrando.
- **RF-212.** Un elemento seleccionado muestra puntos de control en sus esquinas o extremos.
- **RF-213.** Hacer clic fuera de un elemento lo deselecciona.
- **RF-214.** Tecla Delete (o equivalente) elimina el elemento seleccionado.

#### Dibujo de líneas de movimiento

- **RF-215.** Para dibujar una `MovementLine`: el usuario selecciona el tipo, hace clic en la cancha para iniciar la línea, clics adicionales añaden puntos intermedios (línea segmentada), y un clic derecho o un botón "finalizar" termina la línea.
- **RF-216.** Para `line_move` y `line_dribble`, al terminar de dibujar la línea el sistema **asocia automáticamente** la línea al jugador más cercano al punto de inicio, estableciendo el campo `ownerId`. Esto es necesario para el cálculo de herencia de posición (RF-188).

#### Edición de elementos

- **RF-220.** Al seleccionar un elemento se muestra un panel de edición con propiedades específicas por tipo:
  - **Jugador:** símbolo, color de relleno, color del número, modo "solo número" (sin contorno), rotación.
  - **Línea:** tipo, estilo (recta/curva), grosor, color, mostrar/ocultar flecha, puntos de control arrastrables.
  - **Elipse y polígono:** grosor de borde, color de borde, color de relleno, transparencia del relleno.
  - **Texto:** contenido, fuente, tamaño, estilo (normal/negrita/cursiva/subrayado), color del texto, borde y color del borde (opcionales), fondo y color del fondo (opcionales), vista previa.
- **RF-221.** El usuario puede establecer **colores y símbolo por defecto** para jugadores ofensivos y defensivos, de forma que los nuevos jugadores se creen con esa configuración.

### 9.11 Layouts de cancha

- **RF-230.** Una jugada/ejercicio se asocia a un `CourtLayoutType` al ser creada. El layout se elige entre cuatro opciones fijas:

  | Identificador     | Descripción                                  | Dimensiones    |
  | ----------------- | -------------------------------------------- | -------------- |
  | `full_fiba`       | Cancha completa FIBA                         | 28 m × 15 m    |
  | `half_fiba`       | Media cancha FIBA                            | 14 m × 15 m    |
  | `mini_fiba`       | Cancha mini FIBA (3×3, media cancha)         | 15 m × 11 m    |
  | `half_mini_fiba`  | Media cancha mini FIBA (un lado del aro 3×3) | 7,5 m × 11 m   |

- **RF-231.** Las dimensiones y marcas oficiales de cada layout son **constantes inmutables** en el código. No son editables por el usuario.
- **RF-232.** Las marcas oficiales (zona pintada, línea de tres puntos, zona restringida, línea de tiro libre, círculo central cuando aplique) deben respetar las proporciones reales según las dimensiones de cada layout, escaladas al espacio disponible en pantalla.
- **RF-233.** La cancha se renderiza como una capa de fondo no interactiva por debajo del canvas de elementos.

> **Constantes oficiales (en metros) de referencia:**
>
> - `full_fiba`: 28×15. Línea de tres: radio 6,75 m desde centro del aro, distancia mínima a banda 0,90 m. Zona: 4,90×5,80 m. Tiro libre: radio 1,80 m. Círculo central: radio 1,80 m. Zona restringida: 1,25 m.
> - `half_fiba`: mismas marcas que `full_fiba` representadas en la mitad ofensiva (14×15 m).
> - `mini_fiba`: 15×11. Mismas marcas que `full_fiba` salvo que no hay círculo central (juego de media cancha).
> - `half_mini_fiba`: 7,5×11. Mitad longitudinal de `mini_fiba`, marcas proporcionales.

### 9.12 Descripción textual de la jugada/ejercicio

- **RF-240.** Cada `Drill` o `Play` tiene un campo de descripción de **texto enriquecido** (formato HTML).
- **RF-241.** El editor de descripción soporta como mínimo: edición de texto, cambio de fuente/tamaño/color/estilo, inserción de símbolos especiales, operaciones estándar (cortar, copiar, pegar, seleccionar todo).
- **RF-242.** Existe una acción de **auto-relleno** ("Fill"): a partir de los elementos presentes en el nodo raíz del sketch (número de jugadores ofensivos, defensivos, balones, conos, etc.), el sistema rellena automáticamente los campos de información correspondientes en la descripción.

### 9.13 Deshacer y rehacer

- **RF-250.** El editor de jugadas/ejercicios soporta deshacer (`Ctrl+Z`) y rehacer (`Ctrl+Y`).
- **RF-251.** El historial de undo/redo se mantiene durante toda la sesión de edición de la jugada/ejercicio.
- **RF-252.** Tanto las acciones de dibujo (sketch) como las de edición de texto deben ser reversibles.

### 9.14 Reglas de negocio

- **RN-020.** La autoría de un ejercicio o variante se conserva siempre. Cualquier copia o variante derivada mantiene una referencia a su origen, salvo en los casos explícitos de ruptura de referencia (RF-124, RF-164).
- **RN-021.** El `ClubCatalog` no contiene los originales, solo copias publicadas. Los originales viven siempre en la `PersonalLibrary` de su autor.
- **RN-022.** Una entrada del `TeamPlaybook` **no es una copia** de la jugada: es una vinculación viva mientras el autor mantenga su perfil en el equipo (RF-162). La copia solo se materializa en los casos explícitos de RF-163 (opción "crear copia") y RF-164 (autor sale del equipo).
- **RN-023.** Una variante (§9.7) y una rama de árbol de secuencias (§9.9) son conceptos **distintos**. La variante es una jugada/ejercicio derivado de otro. La rama es un camino interno alternativo dentro de la misma jugada.

---

## 10. Convenciones para el desarrollo

> Esta sección recoge convenciones para mantener consistencia en el código. Se irá ampliando conforme avance el proyecto.

- **C-001.** Usar los nombres canónicos en inglés del glosario (§1) en código, nombres de tablas, modelos, endpoints y tests.
- **C-002.** Cualquier operación de "borrado" debe implementarse como soft-delete por defecto (RF-080).
- **C-003.** Los identificadores de requisito (`RF-XXX`, `RN-XXX`, `RD-XXX`, `C-XXX`) son estables. Si un requisito se invalida, marcarlo como _Deprecado_ en este documento pero no eliminar el ID ni reutilizarlo.
- **C-004.** Cuando una funcionalidad esté en disputa entre código y este documento, este documento es la fuente de verdad hasta que se actualice explícitamente.
- **C-005.** Las recomendaciones de los apéndices son **orientativas**. La tecnología y arquitectura del proyecto prevalecen sobre cualquier sugerencia técnica de los apéndices. No se cambia el lenguaje, framework o patrón arquitectónico del proyecto para alinearse con los apéndices.

---

## 11. Partidos y Entrenamientos (Fase F)

### 11.1 Modelo de dominio — Partido (`Match`)

Un `Match` representa un partido oficial o amistoso de un equipo en una temporada.

**Entidad `Match`:**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | Identificador único |
| `team_id` | FK → Team | Equipo que juega el partido |
| `season_id` | FK → Season | Temporada a la que pertenece |
| `date` | DateTime | Fecha y hora del partido (UTC) |
| `opponent_name` | String | Nombre del rival |
| `location` | `MatchLocation` enum | `home` / `away` / `neutral` |
| `status` | `MatchStatus` enum | `scheduled` / `played` / `cancelled` |
| `notes` | Text nullable | Notas libres del entrenador |
| `created_by` | FK → User | Quién creó el partido |
| `created_at` | DateTime | Timestamp de creación |
| `archived_at` | DateTime nullable | Soft-delete |

**Entidad `MatchVideo` (M2M Match ↔ Video):**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | |
| `match_id` | FK → Match | |
| `video_id` | FK → Video | |
| `label` | `MatchVideoLabel` enum | `scouting` / `post_analysis` / `other` |

**Entidad `MatchPlayer` (convocatoria):**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | |
| `match_id` | FK → Match | |
| `player_id` | FK → Player | |

**Entidad `MatchStat` (estadísticas por jugador por partido):**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | |
| `match_id` | FK → Match | |
| `player_id` | FK → Player | |
| `points` | Integer nullable | Puntos |
| `minutes` | Integer nullable | Minutos jugados |
| `assists` | Integer nullable | Asistencias |
| `defensive_rebounds` | Integer nullable | Rebotes defensivos |
| `offensive_rebounds` | Integer nullable | Rebotes ofensivos |
| `steals` | Integer nullable | Robos |
| `turnovers` | Integer nullable | Pérdidas |
| `fouls` | Integer nullable | Faltas |

### 11.2 Modelo de dominio — Entrenamiento (`Training`)

Un `Training` representa una sesión de entrenamiento de un equipo en una temporada.

**Entidad `Training`:**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | Identificador único |
| `team_id` | FK → Team | Equipo |
| `season_id` | FK → Season | Temporada |
| `date` | DateTime | Fecha y hora (UTC) |
| `title` | String | Título de la sesión |
| `notes` | Text nullable | Notas libres |
| `created_by` | FK → User | Quién creó el entrenamiento |
| `created_at` | DateTime | Timestamp de creación |
| `archived_at` | DateTime nullable | Soft-delete |

**Entidad `TrainingDrill` (ejercicios planificados en orden):**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | |
| `training_id` | FK → Training | |
| `drill_id` | FK → Drill | |
| `position` | Integer | Orden dentro del entrenamiento (0-based) |
| `notes` | Text nullable | Notas específicas para este ejercicio en esta sesión |

**Entidad `TrainingAttendance` (asistencia por jugador):**
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Integer PK | |
| `training_id` | FK → Training | |
| `player_id` | FK → Player | |
| `attended` | Boolean | True si asistió, False si no |

### 11.3 Requisitos funcionales — Partidos (RF-300 a RF-331)

- **RF-300.** Solo `HeadCoach` y `TechnicalDirector` pueden crear partidos de un equipo.
- **RF-301.** Un partido pertenece a exactamente un `Team` y una `Season`.
- **RF-302.** El campo `opponent_name` es obligatorio. `date`, `location` y `status` son obligatorios.
- **RF-303.** El estado inicial de un partido recién creado es `scheduled`.
- **RF-304.** Los `StaffMember` pueden ver los partidos pero no crearlos ni editarlos.
- **RF-305.** Un partido puede archivarse (soft-delete). Solo `HeadCoach` y `TechnicalDirector`.
- **RF-310.** La convocatoria (`MatchPlayer`) lista qué jugadores participan en el partido.
- **RF-311.** Solo `HeadCoach` y `TechnicalDirector` pueden modificar la convocatoria.
- **RF-312.** Un jugador puede ser convocado si pertenece a la plantilla activa del equipo en esa temporada.
- **RF-320.** Un partido puede tener cero o más vídeos vinculados (`MatchVideo`).
- **RF-321.** Solo `HeadCoach` y `TechnicalDirector` pueden vincular o desvincular vídeos.
- **RF-322.** Los vídeos disponibles para vincular son los del equipo que ya han sido procesados (status=`completed`).
- **RF-330.** Las estadísticas (`MatchStat`) se registran por jugador convocado.
- **RF-331.** Solo `HeadCoach` y `TechnicalDirector` pueden crear o actualizar estadísticas.

### 11.4 Requisitos funcionales — Entrenamientos (RF-400 a RF-421)

- **RF-400.** Solo `HeadCoach` y `TechnicalDirector` pueden crear entrenamientos de un equipo.
- **RF-401.** Un entrenamiento pertenece a exactamente un `Team` y una `Season`.
- **RF-402.** El campo `title` y `date` son obligatorios al crear un entrenamiento.
- **RF-403.** Los `StaffMember` pueden ver los entrenamientos pero no crearlos ni editarlos.
- **RF-404.** Un entrenamiento puede archivarse (soft-delete). Solo `HeadCoach` y `TechnicalDirector`.
- **RF-410.** Un entrenamiento puede incluir cero o más ejercicios/jugadas (`TrainingDrill`) en un orden definido.
- **RF-411.** Solo `HeadCoach` y `TechnicalDirector` pueden añadir, reordenar o eliminar ejercicios del entrenamiento.
- **RF-412.** Los ejercicios disponibles para añadir son los de la biblioteca personal del entrenador (su `PersonalLibrary`).
- **RF-413.** El campo `position` en `TrainingDrill` determina el orden de presentación (0-based, sin huecos).
- **RF-420.** La asistencia (`TrainingAttendance`) registra si cada jugador de la plantilla asistió o no.
- **RF-421.** Solo `HeadCoach` y `TechnicalDirector` pueden registrar asistencia.

---

## 13. Fase G — Experiencia del entrenador (mejoras)

> Requisitos identificados a partir del análisis comparativo con aplicaciones del sector (mayo 2026).
> Cubren mejoras de productividad para el rol `HeadCoach` y `TechnicalDirector` en el día a día.

### 13.1 Calendario de entrenamientos como home

- **RF-500.** La pantalla de inicio muestra un calendario mensual con todos los entrenamientos del usuario (de todos sus equipos activos). Los días con entrenamiento quedan marcados visualmente.
- **RF-501.** El calendario puede navegarse por semana o por mes.
- **RF-502.** Debajo del calendario se listan los equipos del usuario con la fecha y hora de su próximo entrenamiento programado.
- **RF-503.** Al pulsar un día del calendario que tiene entrenamiento, la aplicación navega al detalle de ese entrenamiento.

### 13.2 Duración por ejercicio y auto-scheduling

- **RF-510.** Cada `TrainingDrill` puede tener un campo `duration_minutes` (entero positivo, opcional). Si no se especifica, no contribuye al cálculo de franjas.
- **RF-511.** El detalle del entrenamiento muestra la franja horaria calculada automáticamente para cada ejercicio: `hora_inicio_entreno + suma_duraciones_previas` → `hora_inicio_ejercicio`.
- **RF-512.** Al modificar la duración de un ejercicio, las horas de inicio de todos los ejercicios posteriores se recalculan en tiempo real (solo frontend; se persiste `duration_minutes`).
- **RF-513.** El tiempo total del entrenamiento (suma de `duration_minutes` de todos los ejercicios) se muestra al pie de la lista.

### 13.3 Grupos por ejercicio

- **RF-520.** Para cada `TrainingDrill`, el `HeadCoach` o `TechnicalDirector` puede definir cero o más grupos de jugadores (hasta 4 grupos por ejercicio).
- **RF-521.** Cada grupo consiste en un número de grupo (1–4) y una lista de `Player` de la plantilla del equipo.
- **RF-522.** Los grupos se almacenan como `TrainingDrillGroup` asociados al `TrainingDrill`, no al `Drill` base.
- **RF-523.** Un jugador puede estar en más de un grupo del mismo ejercicio (útil para rotaciones).

### 13.4 Generador automático de planes de entrenamiento

- **RF-530.** El sistema puede generar automáticamente un plan de entrenamientos para un equipo a partir de un wizard multi-paso.
- **RF-531.** Parámetros del generador: equipo, duración del plan (nº de semanas), duración por sesión (minutos), fecha de inicio, días de la semana + hora de inicio.
- **RF-532.** El generador crea `Training` records con ejercicios seleccionados automáticamente del `ClubCatalog` y de la `PersonalLibrary` del entrenador, priorizando ejercicios con tags relevantes para el equipo.
- **RF-533.** El entrenador puede revisar y modificar el plan generado antes de confirmarlo. Los entrenamientos no se crean en BD hasta la confirmación.
- **RF-534.** El generador respeta la duración por sesión: el total de `duration_minutes` de los ejercicios asignados no supera la duración configurada.

### 13.5 Informes de asistencia

- **RF-540.** La aplicación ofrece un informe de asistencia para un equipo en un rango de fechas seleccionable.
- **RF-541.** El informe muestra: total de entrenamientos en el período, % de asistencia por jugador (presentes / total), % medio del equipo, y lista de entrenamientos con su fecha.
- **RF-542.** Existe una vista alternativa "Entrenamientos completados" que lista los entrenamientos del período con su título, fecha y nº de asistentes.
- **RF-543.** El informe puede exportarse o compartirse (enlace público temporal o PDF generado en cliente).

### 13.6 Favoritos en ejercicios y jugadas

- **RF-550.** Un usuario puede marcar cualquier ejercicio/jugada de su `PersonalLibrary` como favorito.
- **RF-551.** La biblioteca personal muestra una pestaña o filtro "Favoritos" que lista solo los ejercicios/jugadas marcados.
- **RF-552.** El campo `is_favorite` es personal: no se hereda al clonar ni al copiar al catálogo.

---

## 12. Bloques pendientes de definir

Las siguientes áreas están identificadas pero no detalladas todavía. Cuando se aborden, se añadirán como nuevas secciones a este documento.

- **Gestión de jugadores.** Datos personales a nivel de club, datos deportivos por equipo, plantillas, promoción entre equipos del mismo club, foto, contacto familiar, datos médicos, autorizaciones, documentación.
- **Estadísticas agregadas.** Catálogo de métricas, agregación por jugador / equipo / temporada, visualización.
- **Dashboard de inicio.** Qué información agregada se muestra al usuario tras autenticarse y antes de seleccionar un perfil.
- **Notificaciones y comunicación.** _(Aún no discutido.)_
- **Aspectos no funcionales.** Plataforma (web, móvil), idiomas, modo offline, accesibilidad, rendimiento, seguridad, privacidad, cumplimiento normativo (LOPD/GDPR especialmente relevante por datos de menores).

---

## 12. Historial de cambios

| Versión | Fecha       | Cambios                                                                                                                                                                                                                                                                                            |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0.1     | 2026-04-25  | Versión inicial. Cubre actores, modelo de acceso, estructura de club, equipos, soft-delete, temporadas (alto nivel) y ejercicios/jugadas a alto nivel.                                                                                                                                              |
| 0.2     | 2026-04-25  | Integración del documento de gestión de jugadas y ejercicios. Cambios principales: (1) `PersonalLibrary` pasa a ser de cualquier `User`, no solo `HeadCoach` (RF-110 modificado). (2) Excepción a la igualdad de permisos `HeadCoach`/`StaffMember` en edición de jugadas (RF-074, RF-075). (3) Nuevo bloque `TeamPlaybook` (RF-160 a RF-169). (4) Categorías reformuladas como `Tag` (RF-115 a RF-119). (5) Nombre no único, identidad por `id` (RF-112, RF-113). (6) Compartición al catálogo del club: el autor elige tag explícitamente (RF-125). (7) Edición y autoría: solo el autor edita (RF-126 a RF-128). (8) Nuevas subsecciones: árbol de secuencias (§9.9), sketch editor (§9.10), layouts de cancha (§9.11), descripción textual (§9.12), undo/redo (§9.13). (9) Apéndices A y B con flujos y notas técnicas, marcados como orientativos. (10) Glosario ampliado con `SequenceNode`, `SketchElement`, `MovementLine`, `Tag`, `CourtLayoutType`, `TeamPlaybookEntry`. |

---

## Apéndice A — Flujos de usuario principales

> **Carácter orientativo.** Los flujos descritos a continuación son una referencia de UX para entender la intención de las funcionalidades. La implementación final puede diferir en pasos concretos, orden o presentación, según las decisiones de diseño y la tecnología del proyecto.

### Flujo A.1 — Crear una jugada nueva

1. El usuario selecciona el tipo "Plays" en el panel lateral.
2. Pulsa "Nueva jugada".
3. Elige o crea uno o varios `Tag` (opcional).
4. Introduce un nombre (no necesita ser único).
5. Selecciona el `CourtLayoutType` (`full_fiba`, `half_fiba`, `mini_fiba`, `half_mini_fiba`).
6. Se abre el sketch editor con la cancha y un nodo raíz vacío.
7. El usuario arrastra jugadores, balones y demás elementos, y dibuja líneas de movimiento.
8. Para crear la siguiente fase, pulsa "Añadir rama".
9. El sistema crea un nodo hijo aplicando la herencia de posición (RF-188).
10. El usuario ajusta el nuevo estado y añade nuevas líneas.
11. Si en algún punto hay decisiones alternativas, añade ramas adicionales desde el nodo correspondiente, formando un árbol.
12. Escribe una descripción en la pestaña de texto (opcionalmente usa "Fill" para auto-rellenarla).
13. Los cambios se guardan automáticamente.

### Flujo A.2 — Crear un ejercicio nuevo

Idéntico a A.1, seleccionando "Drills" en el paso 1.

### Flujo A.3 — Editar una jugada existente

1. El usuario navega por el panel lateral (por tags si los hay, o por listado).
2. Selecciona la jugada.
3. Se carga el sketch editor mostrando el nodo raíz.
4. El panel de secuencias muestra el árbol completo.
5. Hace clic en cualquier nodo para editarlo.
6. Puede añadir ramas, eliminar nodos o modificar elementos.
7. Si la jugada está vinculada a varios equipos (RF-163), al guardar cambios el sistema le pregunta si aplicar a todos o crear copia para uno.

### Flujo A.4 — Añadir un camino alternativo a una jugada

1. El usuario selecciona un nodo del árbol en el panel de secuencias.
2. Pulsa "Añadir rama alternativa".
3. El sistema crea un nuevo nodo hermano partiendo del mismo estado padre.
4. El usuario etiqueta la rama con la condición que la activa (ej. "Si el defensa cierra la línea de pase").
5. Dibuja el estado alternativo de esa fase.
6. El árbol refleja el nuevo camino junto con el original.

### Flujo A.5 — Vincular una jugada a un equipo

1. El usuario, con perfil activo en un equipo, abre el `TeamPlaybook` del equipo.
2. Pulsa "Añadir desde mi biblioteca".
3. Selecciona una o varias jugadas/ejercicios de su `PersonalLibrary`.
4. Las entradas aparecen en el `TeamPlaybook` con indicador de autoría y fecha de modificación.
5. Otros miembros del equipo ven las jugadas pero solo el autor puede editarlas.

### Flujo A.6 — Compartir una jugada con el catálogo del club

1. El autor abre la jugada en su biblioteca personal.
2. Selecciona "Compartir con el club".
3. Elige uno o varios `Tag` del catálogo del club, o lo deja sin tag.
4. El sistema publica una copia en el `ClubCatalog` con referencia al original.
5. El autor puede más adelante "publicar cambios" o "dejar de compartir".

---

## Apéndice B — Notas de implementación

> **Carácter orientativo.** Las notas siguientes son recomendaciones técnicas. La tecnología, lenguaje, framework y arquitectura del proyecto **prevalecen** sobre estas recomendaciones (ver C-005). Si una nota sugiere una solución incompatible con el stack del proyecto, gana el stack del proyecto.

- **B.1 — Árbol de secuencias.** Se sugiere modelar `SequenceNode` como estructura recursiva. Una opción es almacenarlo serializado (JSON) en la base de datos, evitando una tabla relacional por nodo salvo que el volumen lo requiera.

- **B.2 — `playerId` estable entre nodos.** Crítico para la herencia de posición (RF-188). Cada jugador tiene un identificador persistente que no cambia al moverse entre nodos del árbol. La posición varía por nodo, pero el `playerId` es invariante dentro de una misma jugada.

- **B.3 — Algoritmo de herencia de posición.** Al crear un nodo hijo, iterar sobre los `SketchElement` del padre. Para cada jugador, buscar una `MovementLine` con `ownerId === playerId` de tipo `line_move` o `line_dribble`. Si existe, tomar `points[last]` como nueva posición `(x, y)` del jugador. Copiar el resto de elementos, omitiendo las líneas de movimiento de jugadores.

- **B.4 — Sistema de coordenadas.** Coordenadas normalizadas `[0.0, 1.0]` en ambos ejes para independencia de resolución. La conversión a píxeles ocurre en la capa de renderizado.

- **B.5 — Modelo de cancha.** Las dimensiones de cada `CourtLayoutType` son constantes inmutables. El renderizado (líneas, zonas, arcos) se calcula a partir de esas constantes y el tamaño del canvas en cada render.

- **B.6 — Sketch editor reutilizable.** Diseñar el sketch editor como componente que recibe un `SequenceNode` y emite un `SequenceNode` actualizado, sin conocer la estructura del árbol completo. La gestión del árbol es responsabilidad del componente padre.

- **B.7 — Operaciones destructivas.** Eliminar un nodo con hijos, archivar una jugada, archivar una categoría/tag: requerir confirmación explícita del usuario en la UI.

- **B.8 — Sincronización entre `PersonalLibrary` y `TeamPlaybook`.** Una entrada del playbook **no es una copia**: ambas vistas refieren a la misma entidad. Implementar como referencia (foreign key) y no como duplicación de datos, salvo en los casos materializados de RF-163 (opción "crear copia") y RF-164 (autor sale del equipo).

---

*Documento basado en conversaciones de diseño y en el documento "Basketball App — Requisitos de funcionalidad" (referencia: Basketball Playbook 012, Jes-Soft, 2017, con extensiones propias).*
