# Basketball Clipper — Web

Next.js 14 frontend for the Basketball Clipper platform.

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** — component library (add components with `npx shadcn-ui@latest add <component>`)
- **React Query** — data fetching and caching

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values if needed
```

## Run (development)

```bash
npm run dev
# http://localhost:3000
```

## Type check

```bash
npm run type-check
```

## Build (production)

```bash
npm run build
npm start
```

## Project structure

```
app/                  Next.js App Router pages
  layout.tsx          Root layout
  page.tsx            Dashboard / landing
  upload/page.tsx     Video upload
  clips/              Clip library
  (auth)/             Login + register (unauthenticated layout)
components/
  ui/                 shadcn/ui primitives
  video/              Domain-specific video components
lib/
  queryClient.ts      React Query client singleton
```

## Rules

- Use App Router only — no `pages/` directory
- Components are Server Components by default; add `"use client"` only when needed
- All API calls go through `shared/api/` — never call `fetch()` directly from components
- Use Tailwind classes only — do not create custom CSS files
