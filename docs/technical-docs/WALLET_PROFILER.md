# PANIK — Wallet DeFi-Persona Profiler (v1.0)

> Companion to [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md). That file defines the **live
> risk-scoring** engine (current positions, 60s RPC loop). This file defines the **persona
> classifier**: a once-per-login, full-history analysis that predicts *what type of DeFi user*
> a wallet is — one of the three Compass types — and writes a short AI-narrated description.

> **Scope note:** This feature is **deterministic, not ML.** ML is reserved for v2 *risk scoring*
> only (SYSTEM_ARCHITECTURE §3.5). The classifier here is a transparent weighted formula over
> on-chain features, in the same family as `computeScore`. The only LLM call is **narration** —
> turning the computed feature vector into prose — and it never decides the classification.

---

## 1. The three types

The Compass profiles already exist in the codebase as
`RiskProfile = "conservative" | "moderate" | "aggressive"` (`packages/scoring/src/types.ts`).
Today they are **assigned by hand** — a Supabase column (`watched_wallets.risk_profile`) and a
manual toggle in the Compass UI. They drive real behavior: `ALERT_THRESHOLD` 25/50/75 and
`statusFor()` within/approaching/outside (`packages/scoring/src/profile.ts`).

**This feature replaces the manual assignment with an automatic inference**, computed from the
wallet's lifetime on-chain history at login. The inferred profile becomes the *default*; a manual
override still wins (see §7).

| Type | Operational meaning |
| --- | --- |
| **conservative** | Supply-dominant / little-or-no leverage, blue-chip protocols, no liquidation history |
| **moderate** | Borrows with a buffer, mostly blue-chip, occasional emerging protocols |
| **aggressive** | High sustained leverage, multi-protocol incl. emerging/degen venues, and/or realized liquidations |

The **liquidation count** and **repay discipline** are modifiers *within* a type — a 0-liquidation
veteran and a serial-liquidated gambler can both read "aggressive" by appetite but deserve
different alert sensitivity. The classifier surfaces these as separate signals so the narration
(and, later, the alert thresholds) can reflect them.

---

## 2. Why full history, and why Dune

"All history, any protocol" is the **analytics tier**, not the live RPC loop:

- The live `ActiveAdapter` (SYSTEM_ARCHITECTURE §3.6) reads **current** positions on the
  **specific** protocols we integrate. It cannot see lifetime behavior or protocols we don't
  integrate.
- **Dune** has decoded, cross-protocol, cross-chain spell tables (`lending.supply`,
  `lending.borrow`, later `dex.trades`) covering 15+ EVM chains and every major lending protocol —
  exactly "any protocol, all history".

This does **not** contradict SYSTEM_ARCHITECTURE §3.2, which rejected Dune *for the 60-second alert
loop* (async, minutes of lag). Classification at login is a once-per-wallet, cacheable analytics
job — precisely the role §3.2 *approved* Dune for. The live loop is untouched.

### Why the data gap is the whole argument

Measured on a real wallet (`0xaa40…57e9`), the **30-day** view showed 3 chains / 3 protocols / 34
borrows; the **lifetime** view showed **10 chains / 6 protocols / 2,895 borrows**. A snapshot
profiler would badly under-read this wallet. Full history is the feature.

---

## 3. Architecture

```
        LOGIN (SIWE)  ─ wallet address bound (SYSTEM_ARCHITECTURE §4.2)
               │
               ▼
   cached classification in watched_wallets?  ──fresh──▶ return instantly (0 cost)
               │ miss / stale (TTL)
               ▼
   async profiler job (NEVER blocks login)
               │
               ▼
   Dune query 7771860 (param: wallet)  ──▶ WalletFeatures   (one row, ~0.3 credits)
               │
               ▼
   classifyWallet(features)            ──▶ { profile, riskAppetiteIndex, confidence, reasons }
               │                            DETERMINISTIC — the verdict. No LLM.
               ▼
   narrateProfile(classification)      ──▶ { tagline, description }
               │                            OpenRouter / gemini-2.5-flash — prose only.
               ▼
   cache {features, profile, reasons, tagline, description, computed_at} to watched_wallets
               │
               ▼
   GET /api/profile?wallet=  ──▶ { profile, riskAppetiteIndex, tagline, description, features }
```

Two hard rules:

1. **The LLM narrates, it never classifies.** `classifyWallet` owns the verdict and the numbers;
   Gemini only phrases them. It cannot invent a profile or a liquidation count — those are passed
   in as ground truth. Guarantees cheapness, determinism of the *decision*, and no hallucinated
   risk claims.
2. **Login never blocks on Dune or the LLM.** Serve cache if present; otherwise classify in the
   background and fill in when ready. Both external calls degrade to deterministic fallbacks (§6).

---

## 4. Feature vector (Dune query 7771860)

One row per wallet, cross-chain. Confirmed against live data; ~0.3 credits per run.

| Feature | Source | Signal |
| --- | --- | --- |
| `lendingTxCount` | count of all supply+borrow events | confidence (how much signal exists) |
| `chainsActive` | distinct `blockchain` | reach / sophistication |
| `protocolsUsed`, `protocols[]` | distinct `project` | diversification |
| `lendingAgeDays` | `max - min` block_time | tenure (veteran vs fresh) |
| `depositedUsd`, `borrowedUsd`, `repaidUsd` | sum by `transaction_type` | scale, repay discipline |
| `borrowEvents` | count where type=`borrow` | did they ever lever up? |
| `liquidations` | distinct tx where type ∈ (`borrow_liquidation`,`deposit_liquidation`) | **risk realized** ★ |
| `borrowToDepositRatio` | borrowed ÷ deposited | **leverage appetite** ★ primary axis |

### Two data gotchas (both handled in the query)

- **`amount_usd` is signed.** Repays/withdraws come back **negative** — never net the column; the
  query isolates each `transaction_type`, and `repaid_usd` is wrapped in `abs()`.
- **Liquidations live in `transaction_type`, not the `liquidator` column.** The real enums are
  `borrow_liquidation` (debt force-repaid) and `deposit_liquidation` (collateral seized). The
  `liquidator` column is effectively never populated — filtering on it returns zero.

`emergingProtocols[]` is derived in code (not SQL): the subset of `protocols[]` not in the
blue-chip allowlist (aave, compound, morpho, moonwell, …). Tunable in `classify/params.ts`.

---

## 5. The classifier (`packages/scoring/src/classify/`)

A pure function, same discipline as `computeScore` (no I/O, golden-fixture tests):

```
classifyWallet(features: WalletFeatures): ProfileClassification
  → { profile, riskAppetiteIndex (0–100), confidence (0–1), reasons[], features }
```

`riskAppetiteIndex` is a weighted sum of normalized sub-signals (weights in `classify/params.ts`,
must sum to 1):

| Sub-signal | Normalization | Weight |
| --- | --- | --- |
| leverage | `borrowToDepositRatio / LEVERAGE_FULL` (clamped 0–1) | 0.35 |
| emerging-protocol share | `emergingProtocols / protocolsUsed` | 0.20 |
| liquidations | `liquidations / LIQ_FULL` | 0.20 |
| breadth | `(chains + protocols) / BREADTH_FULL` | 0.15 |
| has-borrowed | `1` if any borrow else `0` | 0.10 |

Band mapping: `< 34` conservative · `34–66` moderate · `≥ 67` aggressive (`APPETITE_BANDS`).

**Confidence** scales with `lendingTxCount` and `lendingAgeDays`; a dust/empty wallet → low
confidence → safe default of `moderate`. `reasons[]` are the deterministic phrases for the
strongest contributors ("High sustained leverage (0.87)", "0 lifetime liquidations", "Used
emerging protocols: sonne_finance, benqi") — these are both the UI fallback text and the input the
narrator phrases from.

### Worked example (real data, `0xaa40…57e9`)

ratio 0.87 → leverage 1.0; emerging share 2/6 = 0.33; liq 0; breadth (10+6)/12 → 1.0; borrowed → 1.
`index = 100·(0.35·1 + 0.20·0.33 + 0.20·0 + 0.15·1 + 0.10·1) ≈ 67` → **aggressive**, with reasons
flagging 0 liquidations + ~99% repaid → narrated as *"disciplined, professional — not a reckless
degen."*

---

## 6. AI narration (`providers/narrator.ts`)

- **Provider:** OpenRouter, model `google/gemini-2.5-flash` (cheap, fast; ~300 in / ~80 out tokens
  → fractions of a cent per wallet).
- **Server-side only.** `OPENROUTER_API_KEY` in backend `.env`; the browser never sees it (mirrors
  the keys-stay-server-side split the scoring API already uses).
- **Input:** `{ profile, features }` (both ground truth). **Output:** strict JSON
  `{ tagline, description }` via `response_format: { type: "json_object" }`.
- **System prompt** forbids changing the profile or inventing numbers; leads the tagline with the
  capitalized profile + a data-driven qualifier (discipline if `liquidations=0` and most debt
  repaid; recklessness otherwise); description cites the 2–3 strongest features by real value.
- **Caching:** persist `tagline`/`description` next to the features; re-narrate **only** when the
  features change (i.e. after a fresh Dune recompute). A returning user costs zero LLM calls.
- **Fallback:** on any LLM/network failure, synthesize the description from `reasons[]`
  deterministically. The UI never blocks on the model.

---

## 7. Backend & UI wiring

- **Schema (`watched_wallets`):** add `inferred_profile`, `profile_confidence`,
  `risk_appetite_index`, `profile_features` (jsonb), `ai_tagline`, `ai_description`,
  `profiled_at`. Keep `risk_profile` as the **effective** value = manual override if set, else
  `inferred_profile`.
- **Endpoint:** `GET /api/profile?wallet=` → `{ profile, riskAppetiteIndex, tagline, description,
  features }` (data **and** prose together). Cache-first; triggers async recompute on miss/stale.
- **Compass UI:** the manual conservative/moderate/aggressive toggle pre-selects the inferred
  type, shows the `tagline` as header + `description` as subtext + the `features` as supporting
  data chips, and lets the user override.

**Override semantics (open decision):** does a manual toggle pin `risk_profile` permanently, or
only until the next reclassification? Defaulting to *pin until the user clears it* — least
surprising.

---

## 8. Build order

```
Phase 1  classify core: WalletFeatures + classifyWallet + params + golden tests   (no I/O)
Phase 2  Dune history provider (query 7771860) + emergingProtocols derivation
Phase 3  /api/profile + watched_wallets columns + cache
Phase 4  AI narration (OpenRouter / gemini-2.5-flash) + deterministic fallback
Phase 5  Compass UI: auto-select + tagline/description/data chips + override
Later    add dex.trades (LP/swap) features — same Dune spell family, same classifier
```

---

## 9. Edge cases (must be in tests)

- **No lending footprint** (e.g. a pure-holder wallet): zero rows → `conservative` /
  "no lending history", low confidence. Never error.
- **Supply-only** (deposits, no borrows): `borrowToDepositRatio = 0`, `borrowEvents = 0` →
  strongly conservative.
- **Dust / brand-new:** low `lendingTxCount` → low confidence → default `moderate`.
- **Whale single position vs many small:** USD-weighted ratios so one big position doesn't get an
  equal vote with dust.
- **Dune/LLM down:** degrade to cache, then to deterministic fallback text — login still completes.

---

## 10. Decision log

| # | Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- | --- |
| 1 | Classifier method | Deterministic weighted index | ML model | No labeled data; explainable; ML is v2 *risk* only |
| 2 | History source | Dune cross-protocol spells | RPC snapshot / Goldsky | "Any protocol, all history" in one query; analytics tier, not the live loop |
| 3 | Execution timing | Async at login, cached | Inline/blocking | Dune is async + metered; login must never block |
| 4 | LLM role | Narration only | LLM classifies | Determinism of the verdict; no hallucinated risk claims; cost |
| 5 | LLM provider | OpenRouter / gemini-2.5-flash | — | Cheapest capable model for a short structured blurb |
| 6 | Profile authority | Inferred = default, manual override wins | Replace manual entirely | Preserves today's toggle as an override |
```