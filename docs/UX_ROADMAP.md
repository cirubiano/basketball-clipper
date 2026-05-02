# UX Roadmap — Análisis de Mejoras 2026

> **Generado:** 2026-05-02  
> **Contexto:** Análisis UX completo de la plataforma tras la finalización de la Fase G.  
> Validado contra Material Design 3, NN/G 10 Heuristics, WCAG 2.1/2.2, B2B SaaS best practices 2026 y benchmarks de Hudl/Catapult.

---

## Resumen ejecutivo

| Indicador | Valor |
|---|---|
| Mejoras identificadas | 52 |
| Críticas | 4 |
| Alta prioridad | 18 |
| Media prioridad | 21 |
| Baja prioridad | 9 |
| Nuevas (no detectadas antes del análisis) | 10 |
| Fases de implementación | 5 |
| Duración estimada (Fases 1-4) | ~4-5 meses |

### Hallazgos principales

1. **Compliance legal urgente**: El European Accessibility Act entró en vigor en junio de 2025. Tres mejoras (indicadores de foco, touch targets 44px, contraste de color) son requisitos legales en la UE, no mejoras opcionales.
2. **Navegación rota en mobile**: Sin bottom navigation ni sidebar colapsable, el 55%+ del tráfico mobile tiene una experiencia deficiente. Es el cambio con mayor impacto percibido.
3. **Sin onboarding**: El 70% de los usuarios SaaS abandona en los primeros 7 días sin un aha moment. La plataforma no tiene wizard de primer acceso.
4. **Dashboard no accionable**: La pantalla de inicio actual no cumple la regla de los 5 segundos (el dashboard debe comunicar valor en < 5s).
5. **Canvas no usable en móvil**: El editor de ejercicios es inaccesible en pantallas < 768px.

---

## Plan de implementación — 5 fases

### Criterios de priorización

1. **Urgencia legal** — Compliance WCAG 2.2 / EU Accessibility Act.
2. **Ratio impacto/esfuerzo** — Quick wins primero.
3. **Dependencias arquitectónicas** — Cambios de navegación antes de construir encima.
4. **Valor estratégico** — Features que desbloquean retención y adopción.

---

### Fase 1 — Bases legales y quick wins
**Duración estimada:** 3-4 semanas · 2 sprints  
**Ítems:** 21  

> Todo lo que es esfuerzo pequeño y no depende de cambios estructurales. Se prioriza la accesibilidad legal (WCAG 2.2 / EU Accessibility Act en vigor desde junio 2025) junto con micro-mejoras de alto impacto. Sin riesgo de regresión, sin tocar arquitectura.

| # | Mejora | Cat. | Pri. | Esfuerzo |
|---|--------|------|------|----------|
| 10 | Indicadores de foco visibles (WCAG 2.2 SC 2.4.11) | Accesibilidad | **Crítico** | Pequeño |
| 11 | Touch targets mínimo 44×44px (WCAG 2.2 SC 2.5.8) | Accesibilidad | Alta | Pequeño |
| 12 | Contraste de color ≥ 4.5:1 en texto (WCAG 2.1 SC 1.4.3) | Accesibilidad | Alta | Pequeño |
| 13 | Alternativa táctil a drag-and-drop (WCAG 2.2 SC 2.5.7) | Accesibilidad | Media | Pequeño |
| 3 | Layout fluido sin max-width fijo | Navegación | Alta | Pequeño |
| 5 | Breadcrumbs con club y equipo activo | Navegación | Media | Pequeño |
| 8 | Panel de alertas y avisos del club | Dashboard | Alta | Pequeño |
| 15 | Micro-interacciones en acciones clave | Micro-int. | Alta | Pequeño |
| 16 | Alerta de cambios sin guardar | Micro-int. | Alta | Pequeño |
| 17 | Toast con acción "deshacer" | Micro-int. | Media | Pequeño |
| 18 | Skeleton screens (no spinner genérico) | Micro-int. | Media | Pequeño |
| 20 | Marcador prominente en detalle del partido | Partidos | Alta | Pequeño |
| 22 | Exportar convocatoria en PDF | Partidos | Baja | Pequeño |
| 26 | Duración total visible al planificar entrenamiento | Entrenamientos | Baja | Pequeño |
| 32 | Búsqueda al asignar ejercicio a entrenamiento | Editor | Alta | Pequeño |
| 33 | Toggle cuadrícula / lista en biblioteca | Editor | Media | Pequeño |
| 34 | Atajos de teclado descubribles (tooltips + panel ?) | Editor | Baja | Pequeño |
| 44 | Empty states con CTAs contextuales | UX General | Alta | Pequeño |
| 46 | Deep links con contexto completo | UX General | Baja | Pequeño |
| 50 | Compresión de imágenes de jugadores (< 150KB) | Rendimiento | Media | Pequeño |
| 51 | Lazy loading del editor de canvas (next/dynamic) | Rendimiento | Media | Pequeño |

---

### Fase 2 — Arquitectura de navegación
**Duración estimada:** 3-4 semanas · 2 sprints  
**Ítems:** 8  

> Los cambios de navegación afectan a todas las páginas y deben hacerse en bloque, no de forma incremental. Bottom nav y sidebar son los cambios más disruptivos del proyecto pero también los de mayor impacto en experiencia mobile. Se incluyen paginación y navegación por teclado porque afectan a la arquitectura de componentes.

| # | Mejora | Cat. | Pri. | Esfuerzo |
|---|--------|------|------|----------|
| 2 | Bottom navigation en mobile (< 768px) | Navegación | **Crítico** | Pequeño |
| 1 | Sidebar colapsable: rail ↔ expanded | Navegación | Alta | Medio |
| 4 | Master-detail layout en listas de datos | Navegación | Media | Medio |
| 7 | Mini-calendario semanal de eventos | Dashboard | Alta | Medio |
| 9 | Vista personalizada por rol (DT / HeadCoach / Staff) | Dashboard | Alta | Medio |
| 14 | Navegación completa por teclado (WCAG 2.1 SC 2.1.1) | Accesibilidad | Media | Medio |
| 42 | Búsqueda global Cmd+K / Ctrl+K | UX General | Alta | Medio |
| 48 | Paginación en listas grandes | Rendimiento | Alta | Medio |

---

### Fase 3 — Dashboard y productividad diaria
**Duración estimada:** 5-6 semanas · 3 sprints  
**Ítems:** 12  

> Una vez la navegación está resuelta, se construye el dashboard "Hoy" y el onboarding guiado — los dos ítems críticos que más retención impactan. Se añaden mejoras de productividad de esfuerzo medio que ya no requieren cambios de arquitectura.

| # | Mejora | Cat. | Pri. | Esfuerzo |
|---|--------|------|------|----------|
| 6 | Dashboard "Hoy" accionable | Dashboard | **Crítico** | Grande |
| 41 | Onboarding guiado first-run (wizard 3 pasos) | UX General | **Crítico** | Medio |
| 28 | Búsqueda y filtros en todas las listas | Jugadores | Alta | Medio |
| 37 | Drop zone mejorada con progreso por partes | Vídeos | Alta | Medio |
| 25 | Plantillas reutilizables de entrenamiento | Entrenamientos | Media | Medio |
| 23 | Drag-and-drop para reordenar ejercicios | Entrenamientos | Media | Medio |
| 21 | Gráficas de barras para estadísticas de partido | Partidos | Media | Medio |
| 27 | Vista grid de cards de jugadores | Jugadores | Media | Medio |
| 38 | Búsqueda y filtros en catálogo del club | Catálogo | Media | Medio |
| 39 | Vista previa del canvas en cards de catálogo | Catálogo | Media | Medio |
| 43 | Modo oscuro | UX General | Media | Medio |
| 49 | Optimistic updates en mutaciones frecuentes | Rendimiento | Media | Medio |

---

### Fase 4 — Mobile-first y tiempo real
**Duración estimada:** 6-8 semanas · 4 sprints  
**Ítems:** 8  

> Esta fase tiene los componentes de mayor coste de implementación. Los ítems grandes (canvas mobile, vista en vivo, modo en cancha) son independientes entre sí y se pueden paralelizar. Se incluyen también thumbnails de clips, notificaciones in-app, anotaciones de playbook e importación de CSV.

| # | Mejora | Cat. | Pri. | Esfuerzo |
|---|--------|------|------|----------|
| 19 | Vista "en vivo" optimizada para tablet | Partidos | Alta | Grande |
| 31 | Canvas editor responsive en móvil | Editor | Alta | Grande |
| 24 | Modo "en cancha" simplificado para tablet | Entrenamientos | Media | Grande |
| 35 | Reproductor de clips con marcadores de posesión | Vídeos | Media | Grande |
| 45 | Centro de notificaciones in-app | UX General | Media | Grande |
| 36 | Thumbnails automáticos en lista de clips | Vídeos | Media | Medio |
| 30 | Importar jugadores desde CSV | Jugadores | Baja | Medio |
| 40 | Anotaciones del coach en el playbook | Catálogo | Baja | Pequeño |

---

### Fase 5 — Escalabilidad y visión
**Duración estimada:** Roadmap · Sprint 12+  
**Ítems:** 3  

> Features de alto valor que requieren que las fases anteriores estén consolidadas. Una PWA offline sobre una UX base rota no tiene valor. El perfil agregado de jugador es la Fase H del roadmap ya documentada.

| # | Mejora | Cat. | Pri. | Esfuerzo |
|---|--------|------|------|----------|
| 47 | PWA instalable con offline parcial | UX General | Media | Grande |
| 29 | Perfil agregado del jugador (stats históricas) | Jugadores | Baja | Grande |
| 52 | Caché offline de datos clave (React Query persist) | Rendimiento | Baja | Medio |

---

## Catálogo completo de mejoras

### Navegación y layout (5)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 1 | Sidebar colapsable: rail ↔ expanded | Alta | Medio | 2 | Material Design 3 navigation rail · NN/G H4 |
| 2 | Bottom navigation en mobile (< 768px) | Crítico | Pequeño | 2 | Thumb zone research · +35% discoverability vs hamburger |
| 3 | Layout fluido sin max-width fijo | Alta | Pequeño | 1 | Responsive best practices 2025 |
| 4 | Master-detail layout en listas de datos | Media | Medio | 2 | B2B SaaS 2026 split-pane pattern |
| 5 | Breadcrumbs con club y equipo activo | Media | Pequeño | 1 | NN/G H1: visibility of system status |

### Dashboard (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 6 | Dashboard "Hoy" accionable | Crítico | Grande | 3 | B2B SaaS 5-second rule · multi-persona design 2026 |
| 7 | Mini-calendario semanal | Alta | Medio | 2 | Coach mental model: semana como unidad de planificación |
| 8 | Panel de alertas y avisos del club | Alta | Pequeño | 1 | NN/G H1: visibility of system status |
| 9 | Vista personalizada por rol ⭐ | Alta | Medio | 2 | B2B SaaS 2026: role-based interfaces — Onething Design |

### Accesibilidad WCAG 2.2 (5) ⭐ Categoría nueva

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 10 | Indicadores de foco visibles (SC 2.4.11) | Crítico | Pequeño | 1 | EU Accessibility Act — vigente junio 2025 |
| 11 | Touch targets mínimo 44×44px (SC 2.5.8) | Alta | Pequeño | 1 | WCAG 2.2 AA · Google: +30% errores < 44px |
| 12 | Contraste de color ≥ 4.5:1 (SC 1.4.3) | Alta | Pequeño | 1 | WCAG 2.1 AA — requisito legal |
| 13 | Alternativa táctil a drag-and-drop (SC 2.5.7) | Media | Pequeño | 1 | WCAG 2.2 AA — obligatorio |
| 14 | Navegación completa por teclado (SC 2.1.1) | Media | Medio | 2 | WCAG 2.1 AA · coaches con tablet + teclado |

### Micro-interacciones y feedback (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 15 | Micro-interacciones en acciones clave ⭐ | Alta | Pequeño | 1 | Gartner: 75% apps en 2025 · +400% retención |
| 16 | Alerta de cambios sin guardar | Alta | Pequeño | 1 | NN/G H9: error prevention |
| 17 | Toast con acción "deshacer" ⭐ | Media | Pequeño | 1 | NN/G H3: user control · Gmail pattern |
| 18 | Skeleton screens (no spinner genérico) | Media | Pequeño | 1 | Facebook/LinkedIn: -30% lentitud percibida |

### Partidos (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 19 | Vista "en vivo" optimizada para tablet | Alta | Grande | 4 | Hudl primary use case: staff en el banquillo |
| 20 | Marcador prominente en detalle del partido | Alta | Pequeño | 1 | Information hierarchy · F-pattern scanning |
| 21 | Gráficas de barras para estadísticas ⭐ | Media | Medio | 3 | NN/G: bar charts 3-4× más rápidos que tablas |
| 22 | Exportar convocatoria en PDF | Baja | Pequeño | 1 | B2B SaaS workflow estándar |

### Entrenamientos (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 23 | Drag-and-drop para reordenar ejercicios | Media | Medio | 3 | Interaction design estándar + WCAG 2.2 SC 2.5.7 |
| 24 | Modo "en cancha" para tablet | Media | Grande | 4 | Sports coaching workflow · Hudl/Catapult pattern |
| 25 | Plantillas reutilizables de entrenamiento | Media | Medio | 3 | Efficiency heuristic · ahorra > 60% tiempo planif. |
| 26 | Duración total visible al planificar | Baja | Pequeño | 1 | Planning UX · evita calcular manualmente |

### Jugadores y roster (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 27 | Vista grid de cards de jugadores | Media | Medio | 3 | Visual scanning: grids para personas · Notion/Figma |
| 28 | Búsqueda y filtros en todas las listas | Alta | Medio | 3 | Information retrieval UX: > 10 ítems necesitan filtros |
| 29 | Perfil agregado del jugador | Baja | Grande | 5 | Sports platform feature parity (Hudl/Catapult) |
| 30 | Importar jugadores desde CSV | Baja | Medio | 4 | B2B SaaS data migration · clubs con Excel |

### Editor de ejercicios (4)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 31 | Canvas responsive en móvil | Alta | Grande | 4 | Mobile-first · 55%+ tráfico mobile |
| 32 | Búsqueda al asignar ejercicio | Alta | Pequeño | 1 | Progressive disclosure · bibliotecas > 20 ítems |
| 33 | Toggle cuadrícula / lista en biblioteca | Media | Pequeño | 1 | Display density preference · Notion/Figma/Linear |
| 34 | Atajos de teclado descubribles | Baja | Pequeño | 1 | NN/G H6: recognition over recall |

### Vídeos y clips (3)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 35 | Reproductor con marcadores de posesión | Media | Grande | 4 | Hudl core feature · feature parity |
| 36 | Thumbnails automáticos en clips | Media | Medio | 4 | Visual scanning: sin thumbnail la lista es solo texto |
| 37 | Drop zone mejorada con progreso por partes | Alta | Medio | 3 | Upload UX · NN/G H1: visibility of system status |

### Catálogo y playbook (3)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 38 | Búsqueda y filtros en catálogo del club | Media | Medio | 3 | Findability UX: > 20 entradas innavegables sin búsqueda |
| 39 | Vista previa del canvas en cards ⭐ | Media | Medio | 3 | Visual affordance: coaches reconocen jugadas por imagen |
| 40 | Anotaciones del coach en el playbook | Baja | Pequeño | 4 | Collaboration UX |

### UX General (7)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 41 | Onboarding guiado first-run | Crítico | Medio | 3 | SaaS research: 70% abandona sin aha moment — Brightscout 2025 |
| 42 | Búsqueda global Cmd+K / Ctrl+K | Alta | Medio | 2 | Power user estándar: Linear, Notion, Vercel, GitHub |
| 43 | Modo oscuro | Media | Medio | 3 | 82% usuarios prefieren tener opción · shadcn/ui parcial |
| 44 | Empty states con CTAs contextuales | Alta | Pequeño | 1 | "Strategic onboarding moments" — Smashing Magazine |
| 45 | Centro de notificaciones in-app | Media | Grande | 4 | B2B SaaS engagement estándar |
| 46 | Deep links con contexto completo | Baja | Pequeño | 1 | Collaboration UX · Next.js App Router nativo |
| 47 | PWA instalable con offline parcial | Media | Grande | 5 | MDN PWA 2025 · Gym WiFi poor · Background Sync API |

### Rendimiento y escalabilidad (5)

| # | Mejora | Pri. | Esfuerzo | Fase | Validación |
|---|--------|------|----------|------|------------|
| 48 | Paginación en listas grandes | Alta | Medio | 2 | Core Web Vitals · 100+ jugadores degradan DOM |
| 49 | Optimistic updates en mutaciones frecuentes | Media | Medio | 3 | Perceived performance · React Query isMutating |
| 50 | Compresión de imágenes de jugadores (< 150KB) | Media | Pequeño | 1 | Core Web Vitals LCP · fotos sin comprimir |
| 51 | Lazy loading del editor de canvas (next/dynamic) | Media | Pequeño | 1 | Bundle size · editor no está en flujo principal |
| 52 | Caché offline de datos clave (React Query persist) | Baja | Medio | 5 | PWA offline · @tanstack/query-sync-storage-persister |

> ⭐ = Mejora detectada en el análisis de mercado, no estaba en la lista original.

---

## Fuentes de validación

- [Smart SaaS Dashboard Design Guide (2026) — F1Studioz](https://f1studioz.com/blog/smart-saas-dashboard-design/)
- [B2B SaaS UX Design in 2026: Challenges & Patterns — Onething Design](https://www.onething.design/post/b2b-saas-ux-design)
- [7 SaaS UX Design Best Practices for 2026 — Mouseflow](https://mouseflow.com/blog/saas-ux-design-best-practices/)
- [SaaS Onboarding UX: Why Most Products Lose Users in the First 7 Days — Brightscout](https://www.brightscout.com/insight/saas-onboarding-ux)
- [WCAG 2.2 Compliance Checklist — Level Access](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/)
- [Microinteractions in UX — BlazeDream](https://www.blazedream.com/blog/microinteractions-enhancing-ux-2025/)
- [Empty States & Onboarding — Raw.Studio](https://raw.studio/blog/empty-states-error-states-onboarding-the-hidden-ux-moments-users-notice/)
- [10 Usability Heuristics — Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Hudl Sports Technology Products](https://www.hudl.com/products)
- [Catapult Vision Alternatives — G2](https://www.g2.com/products/catapult-vision/competitors/alternatives)
