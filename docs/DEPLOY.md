# Deploying PANIK to Vercel (private-link only)

## What gets deployed — and what does NOT

**Deployed** (the static frontend, built to `dist/`):
- `/` — the public landing/marketing page (`index.html`)
- `/app` — the product app UI (`app.html`)

**NOT deployed / never reachable by users:**
- The **scoring core** (`packages/scoring`) — it is *not imported by the client* (the app calls
  the `/api/*` backend), so it is never in the browser bundle. Verified: no `computeScore` /
  `CRASH_REGIME` in `dist/`.
- The **backend & secrets** — the scoring API (`scripts/api-server.ts`) and all backend keys
  (Alchemy, CoinGecko, Dune, Supabase DB URL, Supabase secret key) stay server-side. They are **not**
  used by the frontend and must never be added to this Vercel project.
- The **backtest research** (`scripts/`, `docs/`, data) — excluded via `.vercelignore`.

## Private-link access (the gate)

`middleware.ts` runs at the edge and requires **HTTP Basic Auth on every request** — nothing is
served without it. The "private link" is the deployment URL; your team also needs the shared
password. Credentials come from env vars, never the bundle. It **fails closed**: if the env vars
aren't set, the site returns 503 (never accidentally public).

## Setup (one time)

1. **Import the repo** into Vercel (New Project → import `panik_waitlist`). Framework auto-detects
   as Vite; `vercel.json` sets build = `vite build`, output = `dist`, and `/app → app.html`.
2. **Set Environment Variables** (Settings → Environment Variables, Production + Preview):

   | Var | Value | Why |
   | --- | --- | --- |
   | `BASIC_AUTH_USER` | a username you choose | the private-link gate |
   | `BASIC_AUTH_PASS` | a strong password | share only with the team |
   | `VITE_SUPABASE_URL` | your Supabase project URL | waitlist (public, RLS-protected) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key | public by design |
   | `VITE_WALLETCONNECT_PROJECT_ID` | Reown project id | public by design |

   **Do NOT add** `ALCHEMY_*`, `COINGECKO_API_KEY`, `DUNE_API_KEY`, `SUPABASE_DB_URL`,
   `SUPABASE_SECRET_KEY` here — the frontend doesn't use them, and a frontend project should never
   hold backend secrets.
3. **Deploy.** Visit the URL → browser prompts for the basic-auth user/password → in you go.

## Notes

- **Live scoring is not part of this deploy.** `/api/*` has no backend here, so the app's live
  panels degrade gracefully (offline). To enable live scoring later, deploy the scoring API as a
  **separate** service (or Vercel serverless functions in their own project) holding the backend
  secrets — kept off this frontend project so the core stays private.
- **GitHub repo visibility:** the gate protects the *deployed site*. If the GitHub repo is **public**,
  the source (including the scoring core) is readable on GitHub by anyone. If the core must stay
  private, make the GitHub repo **private**.
- To rotate access: change `BASIC_AUTH_PASS` in Vercel and redeploy.
