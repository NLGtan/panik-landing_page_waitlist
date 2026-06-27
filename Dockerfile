# PANIK Watch worker - standalone 24/7 scoring + Telegram dispatch.
# Host-agnostic (Fly.io / Railway / Render). The worker runs scripts/watch-worker.ts
# via tsx. Vite frontend + Vercel functions are deployed separately, not from here.
FROM node:22-slim

WORKDIR /app

# Install deps (root + workspaces). package-lock.json gives reproducible installs.
COPY package.json package-lock.json* ./
COPY packages/scoring/package.json packages/scoring/package.json
RUN npm ci

# App source.
COPY . .

# Build the SPA so the API service can optionally serve it (SERVE_STATIC=true).
# Cheap (~6s); the worker service simply ignores dist/. Runs before NODE_ENV is
# set to production so devDependencies (vite, tsx) are available.
RUN npm run build

ENV NODE_ENV=production
# Default command targets the web/API service; the worker service overrides this
# with `npm run worker` (Procfile + railway.toml document both).
CMD ["npm", "run", "start:api"]
