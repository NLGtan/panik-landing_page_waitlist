# PANIK — Protocol Camp Build Checklist

> Tracks what is built and what is not. Check items only when **merged and verified**
> (tests passing / pass criteria met), not when "mostly working".
> Companions: [`arch`](./arch) (scoring spec) · [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) (design + decisions).

---

## Phase 0 — Accounts & API keys (get these now so nothing blocks later)

| ✓ | What | Where | Cost | Needed by |
| --- | --- | --- | --- | --- |
| [x] | **CoinGecko Demo API key** (30 calls/min, 10k/mo) — ✅ pinged 2026-06-13 (30d ETH history OK) | coingecko.com → API → Demo plan | Free | Slice 1, week 2 (asset risk) |
| [x] | **Dune account + API key** — ✅ pinged 2026-06-13 (auth OK; MCP server also connected) | dune.com → Settings → API | Free tier | Week 1 (calibration pulls — analytics only, §3.2) |
| [x] | **Alchemy account + Base Mainnet app** — ✅ pinged 2026-06-13 (block reads + Chainlink ETH/USD eth_call OK) | alchemy.com | Free tier | Slice 2 (ActiveAdapter reads) |
| [x] | **Alchemy Base Sepolia app** (same key) — ✅ pinged 2026-06-13 | alchemy.com | Free | Slice 2 (testnet position opening) |
| [x] | **WalletConnect / Reown project ID** — ✅ validated 2026-06-13 (explorer API accepts ID) | cloud.reown.com | Free | Slice 2 (wagmi connect in panik-core) |
| [ ] | **Base Sepolia test ETH** | Coinbase CDP faucet / Alchemy faucet | Free | Slice 2 (signing testnet opens) |
| [ ] | **Decide alert channel**: Telegram bot token (instant) and/or reuse Resend | @BotFather / resend.com | Free | Slice 2–3 (Watch alerts) |
| [x] | **Goldsky project + API key** — ✅ pinged 2026-06-13 (CLI token auth OK, project created, no subgraphs yet; Mirror→Supabase pipeline planned in Slice 3) | app.goldsky.com | Free Starter | Slice 3 (Advisor event feed) |
| [x] | DefiLlama — no key required | — | Free | nothing to do |
| [x] | Chainlink — on-chain reads via Alchemy RPC | — | Free | nothing to do |
| [x] | `.env.example` updated with all keys; `.env` gitignored; secrets never `VITE_`-prefixed | repo root | — | done 2026-06-13 |
| [x] | Connectivity check script — `npm run ping:apis` (tests every service, prints no keys) | `scripts/ping-apis.mjs` | — | all 7 PASS 2026-06-13 |

---

## Pre-camp foundation (done)

- [x] Repo split: `src/panik-landing-page/` (marketing) vs `src/panik-core/` (product app), separate Vite bundles
- [x] `docs/technical-docs/arch` — scoring engine spec
- [x] `docs/technical-docs/SYSTEM_ARCHITECTURE.md` v1.1 — full design + decision log (13 entries) + Q8–Q13
- [x] All smart-contract work explicitly parked for camp (§5.0)

---

## Slice 1 (weeks 1–3) — Scoring Engine V1 + Risk Profile Onboarding

### Week-1 architecture locks (biz Risk 2)
- [x] Dual-mode design decided: pure core + prospective/active adapters (§3.6)
- [x] Calibration policy decided: timeboxed spot-check, not a gate (§3.6)
- [ ] Mentor sync: calibration framing + Q3 (exploit records complete before scores go public)
      + **Q14: sign off liquidation-proximity floors** (calibration finding — see CALIBRATION_REPORT.md)
- [ ] Biz-dev sync: Q12 (position opening = direct calls, fix demo copy) + Q11 (is contract-level allowlist still required?)

### `packages/scoring` — the pure core
- [x] Package scaffolded (npm workspace, vitest, strict TS) — `npm run test:scoring`
- [x] Core math: `clamp`, `stdDev`, `pearsonCorr`, `annualizedVol` + unit tests (arch step 1)
- [x] `S_position_health` + HF 1.0/1.5/2.0 golden tests + zero-debt null-sentinel handling (arch step 2)
- [x] `S_protocol_safety` static config — golden: Aave = 9.75, Moonwell = 46 (arch step 4)
- [x] `S_asset_risk` formula + synthetic-data tests (arch step 3 — formula only; live data below)
- [x] `S_systemic_risk` formula — golden: 0 on stable data, 100 on FTX-style (arch step 5 — formula only)
- [x] `computeScore` composition + band mapping + profile status (`within/approaching/outside`)
- [x] Prospective scenario helpers: `estimateHealthFactor`, `liquidationDrawdown`
- [x] **Week-1 calibration spot-check** — ✅ done 2026-06-13 (Dune 7710372/7710392, 49 real Mar-2023
      liquidations; `HF_CEIL`/`VOL_CEIL` confirmed; **liquidation-proximity floors added** — pure formula
      capped at ~42 for depeg victims; floors close the gap. Full writeup: `CALIBRATION_REPORT.md`;
      reproducible in `tests/calibration.test.ts`)

### Data providers (first I/O)
- [x] `CoinGeckoProvider`: 91d daily prices → 30d returns + 90d extremes, 1h TTL cache (≈7k calls/mo at 5 assets) — tested
- [x] `DefiLlamaProvider`: sector (`/v2/historicalChainTvl`) + protocol (`/protocol/{slug}`) TVL now vs 7d ago — tested
- [x] Provider interface abstraction (`AssetRiskProvider` / `SystemicRiskProvider` — arch Q2 source swap is one class)
- [x] `ProspectiveAdapter`: scenario → HF estimate + market params → `ScoringInput` → score; live demo `npm run demo:scores`

### Product surface
- [ ] Path A onboarding: 5 questions → Conservative/Moderate/Aggressive (under 2 min)
- [ ] Compass: curated recommendations with real scores, matching + flagged non-matching sections
- [ ] Each recommendation: expected yield, risk score, plain-language explanation, worst-case scenario
- [ ] First 3 external users onboarded (biz Risk 5 — they test onboarding + recommendations only)

### Protocol expansion (2026-06-13 — beyond camp's two-protocol baseline)
- [x] **Morpho + Compound V3 in the engine** (prospective/Compass only): types, researched
      protocol-safety configs (Morpho 20.5, Compound V3 18.85 — pending the same Q3 verification
      bar), market params (Morpho 86% LLTV tier; Comet borrowCF/liqCF), DefiLlama slugs verified
      live, 2 new Compass scenarios, Morpho/Compound logos. Risk ordering asserted in tests:
      Aave < Compound V3 < Morpho < Moonwell. 90 tests green.
- [ ] Compound V3 active reader (Comet `borrowBalanceOf` + `userCollateral`) — Slice 2 buffer item
- [ ] Morpho active reader — post-mid-demo; market discovery via the Mirror event stream or Morpho API
- [ ] Biz dev/mentor sign-off on 4-protocol scope (their plan committed to 2 done well)

### Slice 1 pass criteria (from biz plan)
- [ ] Scores display correctly for known positions
- [ ] Conservative user sees only 0–24 positions recommended; Moderate 0–49
- [ ] Score output sane against historical stress data (manual check)

---

## Slice 2 (weeks 4–6) — Position Opening + Active Monitoring

### ActiveAdapter (chain reads)
- [x] viem client + multicall batching — ✅ 2026-06-13, validated against live Base mainnet
- [x] Aave reads: `getUserAccountData` (HF/LTV/maxLtv), zero-debt `uint256.max` → null, 8-dec USD units,
      aToken-based dominant-collateral discovery (v1: dominant asset scores; full per-reserve breakdown later)
- [x] Moonwell reads: `getAssetsIn` discovery + per-mToken accounting + oracle prices + **derived HF**
      — ✅ validated live (real $2M AERO position → HF 2.04; real HF-1.22 USDC position → HIGH/outside).
      Biz Risk 3 (Moonwell read-path) is RETIRED.
- [x] Chainlink price reads + per-feed heartbeat staleness guard — ✅ 2026-06-13, 4 feeds
      verified live via `description()` (ETH/USDC/cbETH/BTC on Base); stale ⇒ degrade, never score
- [x] Price-movement trigger (`PriceWatcher`, ≥2% ⇒ immediate re-score; stale reads never move
      the baseline) — detection done; always-on service wiring = backend deploy task
- [x] 60s monitoring loop skeleton: `WatchService` — profile-relative transition events, per-wallet error
      isolation, pluggable notifier (`npm run demo:watch` scores real wallets end-to-end)
- [ ] On-chain event triggers (liquidations/borrows via Goldsky webhook or log subscription) —
      price-movement half is done; event half lands with the Goldsky integration below

### Identity & opening
- [ ] SIWE auth (EIP-4361) + wallet↔account binding (never trust bare connection)
- [ ] **Week-4 (or earlier) Moonwell write-path assessment** — biz Risk 3 + §5.6; adjust scope if needed
- [ ] Position opening via **direct protocol calls** (frontend-built calldata, §5.6): Aave supply/borrow on Sepolia
- [ ] Moonwell opening per assessment outcome (supply-only fallback acceptable)
- [ ] Path B onboarding: LLM prompt → strict JSON-schema validation (treat as untrusted input)

### Watch UI
- [ ] Position status vs USER's profile: Within / Approaching / Outside (plain language default, raw score on expand)
- [ ] Alert fires at profile threshold (25/50/75) via chosen channel

### Slice 2 pass criteria
- [ ] Connect → onboard → open position through Panik → monitored with correct profile-relative status
- [ ] 3–5 external users active

### Mid-demo (week 5–6, first week of July)
- [ ] Demo flow rehearsed: onboarding → recommendations → open → monitor

---

## Slice 3 (weeks 7–10) — Advisor (Recommendation Engine)

- [ ] Scenario catalog: most common risk scenarios across both protocols
- [ ] Four-section format: What happened / Why it matters for you / Protocol context / What Panik recommends (with $ + gas costs)
- [ ] New data feeds: Aave governance proposals (Tally/Snapshot), utilization trends, exploit history (DefiLlama)
- [x] **Goldsky Mirror pipeline → Supabase Postgres** — ✅ DEPLOYED 2026-06-13 (`panik-lending-events`,
      status ACTIVE). Streams **four protocols** on Base (Aave V3 Pool, Moonwell 21 mTokens, Morpho Blue,
      Compound V3 cUSDCv3+cWETHv3) into `onchain.lending_events`: lend/borrow/repay/withdraw/liquidation
      events, names normalized, user extracted from topics/data, raw topics+data retained for
      re-derivation. Topic0 hashes computed with viem (never hand-typed); all sink addresses verified
      on-chain pre-deploy. Config generator: `scripts/goldsky/gen-config.mjs`; sanity check:
      `node --env-file=.env scripts/goldsky/check-events.mjs`. `start_at: latest` (no backfill — budget).
      ⚠ v1 caveats: amounts not decoded (raw data kept); Morpho per-event topic positions to verify
      against real rows.
- [ ] Wire event triggers: watched-wallet event in `lending_events` ⇒ immediate re-score (worker task)
- [ ] Four-option response UI: Recommended / Alternative / Adjust profile / Dismiss
- [ ] Recommendation copy reviewed by ≥3 real DeFi users before ship (biz Risk 4)

### Slice 3 pass criteria
- [ ] Recommendation fires correctly on threshold crossing; all four sections accurate
- [ ] Matches what an experienced DeFi user would actually do

---

## Slice 4 (weeks 10–12) — Polish + 10 Users + Final Demo

- [ ] End-to-end QA, UI polish
- [ ] All 10 external users active, feedback documented
- [ ] Demo wallet: positions on both protocols at different score levels + one live recommendation scenario
- [ ] **Moonwell team briefed before scores go public** (relationship conversation — from biz plan)
- [ ] Demo narrative rehearsed

### Final success definition (biz plan, all six)
- [ ] Onboarding → personalized profile + curated recommendations in under 5 minutes
- [ ] Position opening working on testnet for both protocols (per §5.6 scope outcome)
- [ ] Profile-relative monitoring (not generic thresholds)
- [ ] ≥1 high-quality recommendation fired on a real score change, four sections visible
- [ ] ≥10 external users tested + feedback
- [ ] Scoring differentiates Aave vs Moonwell, explainably and defensibly

---

## Parked (do NOT build during camp)

- PanikAccessRegistry (pending Q11) · Exit-MVP hardening → mainnet (post-camp P2) ·
  SentinelManager (v2) · Vault (Q13 — challenge before committing) · Goldsky integration ·
  ML layer (v2 Python sidecar)
