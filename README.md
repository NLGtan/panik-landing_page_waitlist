# PANIK — DeFi Risk Intelligence

PANIK scores DeFi lending positions for liquidation risk and warns early — validated against real
black-swan crashes (June-2022 ETH, UST/LUNA, FTX, USDC depeg, Aug-2024) across Aave, Compound,
Moonwell, and Morpho on Ethereum and Base.

This repo is the **frontend** (marketing landing + product app). The scoring engine and keys stay
server-side and are never shipped to the browser.

## Run locally

**Prerequisites:** Node.js 22+

1. Install dependencies: `npm install`
2. Copy `.env.example` → `.env` and fill in the keys you need (see the comments in that file —
   only `VITE_`-prefixed vars reach the browser).
3. Run the frontend: `npm run dev` (Vite on :3000 — landing at `/`, app at `/app.html`)
4. Optional, for live scoring: `npm run dev:api` (the scoring API on :8787; keys stay server-side)

## Layout

- `src/panik-landing-page/` — public marketing site (`index.html`)
- `src/panik-core/` — the product app (`app.html`); fetches scores from the `/api` backend
- `packages/scoring/` — the pure scoring engine (server-side only; not imported by the client)
- `scripts/` — the scoring API and the backtest/validation harness
- `docs/` — architecture, backtest results, and deployment guide

## Docs

- Deployment (Vercel, private-link): [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Backtest validation: [`docs/technical-docs/BACKTEST_OVERVIEW.md`](docs/technical-docs/BACKTEST_OVERVIEW.md)
- MVP assessment: [`docs/MVP_ASSESSMENT.md`](docs/MVP_ASSESSMENT.md)

## Testing

`npm run test:scoring` — the scoring engine + backtest test suite. `npm run lint` — typecheck.
