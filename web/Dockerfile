FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Usa `npm ci` (estricto, reproducible) si hay lockfile; si no, cae a
# `npm install` para que dev funcione sin necesidad de commitear el lock.
# En cuanto generes el package-lock.json (ej. `npm install` en local)
# los builds en CI / producción usarán `npm ci` automáticamente.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
