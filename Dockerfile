# PANIK backend image - runs the Express API (npm run start:api) by default, or
# the worker (npm run worker, overridden per Railway service). Host-agnostic.
FROM node:22-slim

WORKDIR /app

# Install deps (root + workspaces). .npmrc carries legacy-peer-deps=true, which
# `npm ci` needs here: wagmi@3 declares peerOptional typescript >=5.9.3 while the
# repo pins ~5.8, so a strict `npm ci` errors with ERESOLVE without it. Copy it
# BEFORE npm ci (a plain `COPY . .` would land it too late), and pass the flag
# explicitly as a belt-and-suspenders.
COPY package.json package-lock.json* .npmrc ./
COPY packages/scoring/package.json packages/scoring/package.json
RUN npm ci --legacy-peer-deps

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
