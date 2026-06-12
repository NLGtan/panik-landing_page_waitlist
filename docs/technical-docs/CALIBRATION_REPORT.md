# Week-1 Calibration Spot-Check — Risk Scoring Engine

> 2026-06-13 · biz plan Risk 1 / SYSTEM_ARCHITECTURE §3.6 · timeboxed calibration, not a validation gate.
> Reproducible: vectors live in `packages/scoring/tests/calibration.test.ts` (`npm run test:scoring`).

## Method

Per §3.6: pull real liquidations from a historical crash, reconstruct plausible pre-event
position states, feed them through the scoring engine, and check that positions which died
scored HIGH/CRITICAL **before** the event while safe positions did not. Event: **Mar 2023 USDC
depeg** (the only major crash after Aave V3's Jan-2023 Ethereum launch; data is Ethereum
mainnet per arch Q2 — Base did not exist yet).

## Data (Dune, ~1.3 credits total)

| Query | What | Key result |
| --- | --- | --- |
| [7710372](https://dune.com/queries/7710372) | Aave V2 Ethereum `LiquidationCall` events, Mar 10–15 2023 | **49 users liquidated on USDC-collateral/USDT-debt on Mar 11 alone** (59 events, $6.2M debt covered); secondary WETH-collateral wave Mar 10 |
| [7710392](https://dune.com/queries/7710392) | Daily USDC/WETH/WBTC prices, Dec 9 2022 – Mar 15 2023 | USDC: $1.0005 (Mar 9) → **$0.9405** (Mar 11). WETH: $1521 (Mar 9) → $1414 (Mar 10, −7%) |

Price series are embedded as fixtures (`tests/fixtures/depeg2023.ts`) so the calibration
re-runs offline forever.

## Findings

### 1. The formula's blind spot — confirmed and material

A typical Mar-11 victim (USDC collateral, HF ≈ 1.05 on Mar 9) scored **~40 (ELEVATED)** under
the pure weighted composite, two days before liquidation:

- `S_position_health` ≈ 95 — but it is capped at **40% of the composite**
- `S_asset_risk`(USDC, pre-depeg) ≈ **0.5** — 30d vol, 90d drawdown, BTC correlation were all silent
- `S_systemic_risk` ≈ 0 — TVL was flat before the event

**No tuning of `HF_CEIL`/`VOL_CEIL` can fix this**: with all market terms silent, the composite
is mathematically capped at ~42 even at HF = 1.0. The biz-plan pass criterion ("positions that
would have been liquidated must score High or Critical before the event") is unreachable by
parameter tuning alone.

### 2. Fix: liquidation-proximity floors (new mechanism — needs mentor sign-off)

`LIQUIDATION_PROXIMITY_FLOORS` in `packages/scoring/src/params.ts`:

| Condition | Floor | Plain language |
| --- | --- | --- |
| HF ≤ 1.10 | score ≥ 75 (CRITICAL) | "You are one ~9% collateral move from liquidation" |
| HF ≤ 1.25 | score ≥ 50 (HIGH) | "One ~20% move from liquidation" |

Properties: simple, explainable by construction, never *lowers* a score, never fires on
no-debt positions, and leaves the weighted formula untouched for HF > 1.25. This mirrors what
the landing-page mockup formula already did (HF ≤ 1.0 → score 85+), so product behavior stays
consistent with what users have seen.

### 3. Post-fix calibration results (all asserted in tests)

| Vector (real Mar-9 market data) | Score | Band | Verdict |
| --- | --- | --- | --- |
| USDC collateral, HF 1.05 (the depeg cohort) | ≥75 | CRITICAL | ✅ warned 2 days early |
| WETH collateral, HF 1.07 (Mar-10 ETH leg) | ≥75 | CRITICAL | ✅ |
| WETH collateral, HF 1.6, same market | <50 | ELEVATED | ✅ no false alarm |
| USDC, no debt | — | LOW | ✅ floors never fire without debt |
| `S_asset_risk`(WETH, pre-event) | 25–75 range | — | ✅ vol/corr read sensibly |

### 4. Parameter verdicts

| Param | Verdict | Evidence |
| --- | --- | --- |
| `HF_CEIL = 2.0` | **Keep** | HF 1.6 → sub-score 40 → composite <50 (sane mid-range); HF gradient across demo scenarios is smooth |
| `VOL_CEIL = 1.0` | **Keep** | Pre-event WETH annualised vol ≈ 50% → vol score ≈ 50 — mid-scale for a volatile-but-normal market, leaving headroom for crisis regimes |
| `SECTOR_FLOOR / PROTO_FLOOR` | **Keep (unvalidated)** | The depeg window is too short for 7d TVL signals; validate opportunistically when a drawdown occurs during the cohort |
| `LIQUIDATION_PROXIMITY_FLOORS` | **New — added** | Finding 1; the only simple mechanism that satisfies the biz-plan pass criterion |

## Known limitations (honest list for the mentor)

1. Pre-event HF values (1.05 / 1.07) are *representative reconstructions* from price-walking
   the liquidation cohort, not per-wallet accounting. Good enough for parameter calibration;
   not a backtest.
2. Stablecoin tail risk remains invisible to `S_asset_risk` *until* a depeg starts — the floor
   mitigates the consequence (near-liquidation positions alert anyway), but a calm-market
   stablecoin position at HF 1.4 still scores low. v1.1 candidates: peg-deviation signal or
   stablecoin-specific vol floor. Logged, not built.
3. Aave V2 events proxy for V3 (V3 Ethereum was 6 weeks old at the depeg). HF/LTV mechanics
   are identical for our formula's purposes.

## Action items

- [ ] Mentor sign-off on the proximity floors (extends arch's formula — Q14 added to checklist)
- [ ] Biz dev: pass criterion is now met; demo can show the depeg story ("we replay Mar 2023 and PANIK alerts 2 days early")
