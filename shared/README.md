# Basketball Clipper — Shared

TypeScript types and API client shared between the web and mobile apps.

## Structure

```
types/    Domain types mirroring the backend Pydantic schemas
api/      fetch wrappers for every backend endpoint
```

## Usage

Import via path alias (`@shared/*`) configured in each consumer's `tsconfig.json`:

```typescript
import type { Clip, Video } from "@shared/types";
import { getClips, uploadVideo } from "@shared/api";
```

## Rule

**Never call `fetch()` directly from web or mobile components.** All HTTP calls
go through `shared/api/`. This ensures a single place to update when the
backend contract changes.
