# PANIK Backtest Program — Complete Overview

> Capstone index of every backtest run to validate and tune the risk-scoring engine.
> Companion docs: [BACKTEST_METHODOLOGY](./BACKTEST_METHODOLOGY.md) (rigor rules),
> [BACKTEST_RESULTS](./BACKTEST_RESULTS.md) (detailed findings), [CALIBRATION_REPORT](./CALIBRATION_REPORT.md)
> (week-1 spot-check). All numbers reproducible from saved data + the scripts/queries listed at the end.

## 1. Goal

Answer the team-lead question — *"if PANIK had existed during a past crash, would it have saved my
position?"* — with a **measured** number, honestly. For a money product a misleading accuracy figure
is a liability, so the program is built on the four anti-bias rules in
[BACKTEST_METHODOLOGY](./BACKTEST_METHODOLOGY.md): no look-ahead, **survivor controls** (not just
liquidated positions), score against the **same oracle** the protocol liquidates on, and report
**recall + false-alarm together** (never a bare catch-rate).

## 2. Events tested (all real, on-chain, Aave V2 Ethereum)

Black-swan liquidation ground truth (Dune 7731427):

| Event | Date | Aave liquidations | Wallets | Debt repaid |
| --- | --- | --- | --- | --- |
| stETH / June ETH crash | Jun 2022 | 5,551 | 1,970 | $143.3M |
| UST / LUNA collapse | May 2022 | 2,657 | 1,353 | $92.9M |
| FTX collapse | Nov 2022 | 334 | 221 | $21.0M |
| USDC depeg (SVB) | Mar 2023 | 119 | 102 | $8.0M |

Four of these were taken all the way to a per-wallet survivor backtest (below). Base did not exist
until Aug 2023, so all reconstruction is Ethereum Aave V2; HF/LTV mechanics are identical for the
formula's purposes.

## 3. Two backtest methods

1. **Lead-time replay (June).** 19 WETH-collateral liquidations replayed hour-by-hour. Because debt
   is a stablecoin ≈ $1 and HF ≈ 1.0 at liquidation, `HF(t) = WETH(t)/WETH(t_liq)` — exact from the
   public price series, no balance accounting. Measures *how early* PANIK fires.
   Fixtures `tests/fixtures/ethCrash2022.ts`; runner `scripts/backtest/eth-crash-2022.ts`.

2. **Survivor confusion matrix (all 4 events).** The honest accuracy method. Reconstruct exact health
   factors for liquidated **and surviving** borrowers via archive RPC
   `LendingPool.getUserAccountData()` at dense crash blocks, then run each through the real
   `computeScore`. (Flow-reconstruction of positions was tried and proven unreliable — aggregator
   contracts, `onBehalfOf`≠`user`, rebasing aTokens; the protocol's own `getUserAccountData` is the
   source of truth.) Runners `survivor-matrix-real.ts` (June/UST/FTX) and `survivor-matrix-usdc.ts`.

## 4. Headline results

**Lead time (June, the marquee case).** With only the static floors, CRITICAL fired at median HF
1.09 (≈ the HF≤1.10 floor) — the **$40M whale got 17h** of warning. The shipped crash-regime lifts
that to **44h** (healthy-start median; whale 44h), a ~2.6× gain, with **no position made worse**.

**Accuracy at full borrower population (no sampling — 5,052 + 232 positions across 4 events):**

| Event | Baseline recall | Shipped recall | Shipped false-alarm |
| --- | --- | --- | --- |
| June 2022 | 49% | **88%** | 34% |
| FTX | 41% | **53%** | 27% |
| UST/LUNA | 94% | 94% (neutral) | 20% |
| USDC depeg | 97% | 97% (neutral) | 30% |
| **June+UST+FTX pooled (exact)** | 65% | **89%** | 27% (precision 35%) |

Defensible user-facing claim: *"Across real crashes, PANIK flags ~89% of soon-to-be-liquidated
positions, a median ~44h early, at a ~27% false-alarm rate."* Recall and false-alarm transfer to
production; a high false-alarm in a deep crash is intrinsic (positions within 25% of liquidation in a
50% crash often survive only by acting or luck).

## 5. Real-time operation & forward-test

The backtest validates the engine on the *past*; the same engine runs **live in real time** and is
forward-validated on the *present* — closing the loop.

**Same engine, live.** The scoring API (`scripts/api-server.ts`, `npm run dev:api`) scores the live
watched wallets every cycle using the **identical `computeScore`** the backtest validated. Health
factors come from live chain reads (Aave/Moonwell/Morpho/Compound adapters + Multicall3), prices
from the same oracle the protocol liquidates on. So the recall/lead-time numbers above are properties
of the code that is actually running, not a separate offline model.

**Forward-test (the live analog of the backtest).** `scripts/backtest/forward-test.ts` hits
`/api/scores` and appends a timestamped band per live position to `data/forward-test-log.jsonl`,
flagging band transitions. Run it on a 60s loop (or cron). Where the backtest *replays* 2022, the
forward-test *records the future*: when a watched wallet is later liquidated, the log yields the
**realized lead time** — continuous validation with zero replay assumptions.

```
npm run dev:api                                 # serve live scores (same engine)
npx tsx scripts/backtest/forward-test.ts        # snapshot + append to the log (loop on 60s)
```

**Live snapshot (example run):** 14 live positions scored — bands `{LOW 4, ELEVATED 5, HIGH 3,
CRITICAL 2}`. The two CRITICAL are live positions the engine is flagging *right now*, exactly as it
would have flagged the 2022 cohort.

## 6. What shipped vs what was tested and rejected

**Shipped (in `packages/scoring/src/params.ts`):**
- `LIQUIDATION_PROXIMITY_FLOORS` — HF≤1.10 → CRITICAL, HF≤1.25 → HIGH (week-1 calibration; catches
  near-liquidation positions even in a calm market — the USDC-depeg blind spot).
- `CRASH_REGIME` — in a confirmed sell-off (`S_asset_risk ≥ 60`) escalate to CRITICAL at `HF ≤ 1.25`.
  Buys the lead time above; gate measured (calm vs crash regime gap).

**Tested with real data and REJECTED (kept on record, not shipped):**
- **HF≤1.35 crash gate** — +4pt recall for +10pt false alarms vs 1.25. Poor trade.
- **Acute-drawdown trigger (v2)** — escalate on a ≥10% 3-day collateral drop regardless of 30d vol.
  Dense UST sampling showed the static floor already catches UST at 94%; the trigger added +6pt
  recall for +17pt false alarms. Redundant.
- **Peg-deviation term** — escalate when a stablecoin collateral is ≥2% below $1. A depeg reprices
  collateral via the oracle, so HF already drops and the floor catches it (97% recall); the term gave
  +0 recall, +11pt false alarms. Redundant.

## 7. The unifying lesson

Every crash — fast ETH (UST), broad (June/FTX), or stablecoin depeg (USDC) — ultimately shows up as
the **oracle-priced HF falling**, and the static `HF ≤ 1.10` floor already catches it under realistic
dense monitoring. Escalation only earns its place when it buys **lead time** against a slow-saturating
signal — which is exactly and only the vol-gated crash-regime on ETH-led crashes (17h→44h).
Drawdown/peg signals fire ~simultaneously with the HF drop, so they buy no lead time and only add
false alarms. **Two rejected experiments are evidence the current rule is near a local optimum for
this position type.**

## 7b. Multi-protocol / multi-chain extension (Base)

The Ethereum results above are Aave V2. To cover how PANIK actually reads positions (Base:
Aave V3 / Moonwell / Morpho / Compound III), we confirmed liquidation data exists for **all four
protocols across three Base black swans** and began validating them.

Recon (Dune `lending` spell, query 7748861) — wallets liquidated:

| Protocol | Aug 2024 (yen-carry) | Feb 2025 | Apr 2025 |
| --- | --- | --- | --- |
| Aave V3 | 1,544 | 2,304 | 2,730 |
| Moonwell | 1,002 | 859 | 1,920 |
| Morpho | 279 | 576 | 651 |
| Compound III | 221 | 147 | 56 |

**Validated so far — Aave V3 on Base, Aug-2024 (2,068 wallets, exact HF via `getUserAccountData`
on the Base pool):**

| | Recall | False-alarm | Precision |
| --- | --- | --- | --- |
| Baseline (static floor) | **92%** | 24% | 95% |
| Shipped (crash-regime) | 92% (neutral) | 24% | 95% |

The engine **generalizes cleanly to V3 + Base + a new crash** (92% recall, in line with Ethereum).
Crash-regime was neutral because Aug-5-2024 was an *intraday* crash that recovered by daily close,
so the 30d-vol gate peaked at 52 (< 60) — the static floor caught it regardless. Reproduce:
`fetch-survivors-base.mjs aave-aug24` + `survivor-matrix-base.ts aave-aug24 7749291`.

**Validated — Compound III on Base, Aug-2024 (117 real WETH-collateral liquidations).** A
protocol-agnostic *price-walk* (a position is liquidated when HF≈1, so with stablecoin debt
`HF(t)=WETH(t)/WETH(t_liq)` — no protocol-specific health call needed) replayed each liquidation
through the real engine: **100% caught CRITICAL before liquidation, median 18h lead** (crash-regime
neutral — same intraday-flash reason). This is recall + lead time, not a survivor false-positive rate
(price-walk has no HF≈1 anchor for survivors; the FP rate is an engine property already measured on
Aave). Reproduce: `price-walk.ts compound-aug24-liq.json`.

**Remaining — Moonwell & Morpho.** The unified `lending` spell pairs collateral cleanly for Aave and
Compound (WETH→USDC) but **not** for Moonwell (Compound-v2 fork; collateral seize isn't tagged in the
spell — pull from `moonwell_base.m*_evt_liquidateborrow.mTokenCollateral`) or Morpho (Blue's isolated
collateral isn't a "supply" event — pull from the Morpho `Liquidate` event + market params). Both
then price-walk the same way. Full survivor matrices for the three would additionally need their own
health readers (Comet `isLiquidatable`+collateral math; Moonwell `getAccountLiquidity`; Morpho
`position`+oracle); the price-walk gives recall+lead-time without them. Then Feb/Apr-2025 for all.

## 8. Validated scope & limitations

- **Position type:** WETH-collateral / stablecoin-debt (and USDC-collateral for the depeg). Not yet
  BTC/alt collateral or volatile-debt.
- **Protocol/chain:** Aave V2 Ethereum. Not yet Aave V3 / Base / Moonwell / Morpho / Compound.
- **Sampling:** UST & USDC are dense (6h); June & FTX use 4 daily blocks, so their recall (88%/53%)
  is a *floor* — the real 60s loop samples far denser. June's continuous hourly replay caught 19/19.
- **Systemic input held flat** in replay (TVL unavailable offline) — conservative (under-warns).
- Not yet mentor-signed-off; all work uncommitted.

## 9. Data, scripts & queries (reproduction)

**Engine & tests:** `packages/scoring/src/{computeScore,params}.ts`;
`packages/scoring/tests/{backtest,calibration}.test.ts` (102 tests pass).

**Scripts (`scripts/backtest/`):**
- `dnsfix.mjs` — routes Node DNS through Cloudflare when system DNS is down (in-process; needed on
  this machine).
- `eth-crash-2022.ts` — June lead-time replay. `diagnose-assetrisk.ts` — asset-risk regime gap.
- `pull-cohort.mjs` / `pull-cohort-usdc.mjs` — Dune-API cohort pulls (survivor cap arg; 100000 = full
  population). `events.mjs` — per-event archive blocks.
- `fetch-survivors-multi.mjs` — chunked archive `getUserAccountData` (free-tier-safe). MUST run
  events **sequentially** — concurrent jobs trip Alchemy's 429 limit.
- `survivor-matrix-real.ts` (June/UST/FTX) & `survivor-matrix-usdc.ts` — confusion matrices.
- `verify-assetrisk-multi.ts` — confirms the asset-risk gate per event.
- `forward-test.ts` — **real-time** forward-test: scores live positions via the API, logs band
  transitions to `data/forward-test-log.jsonl` (run on a 60s loop). Live counterpart of the backtest.

**Data (`scripts/backtest/data/`):** `{june,ust,ftx,usdc}-{candidates,hf}.json` (full population).

**Dune queries:** 7731427 (black-swan summary); 7731466/7731514/7731537/7731553 (June);
7734090/7739767 (param cohorts); 7739633 (daily prices); 7739626/7740207/7740575 (block numbers);
7740508 (USDC price); 7740622 (USDC cohort); 7710372/7710392 (week-1 calibration).

**Infra notes:** Dune cost ≈ a few credits total (bills by data scanned, not rows — 100k wallets is
~one cheap query). The real ceiling is **Alchemy archive RPC** (free tier throttles; full-population
reconstruction ≈ 67k calls runs serially over ~30 min). A paid Alchemy tier would make large/parallel
reconstruction fast.

## 10. Next steps

1. Mentor sign-off on `CRASH_REGIME`.
2. Broaden scope (the real gap, more than raw wallet count): BTC/alt collateral, Aave V3 / Base, other
   protocols, dense sampling on June/FTX.
3. Keep the user-facing claim scoped to recall + false-alarm; never an unscoped "% accurate".
