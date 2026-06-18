/**
 * PANIK backtest runner — June-2022 ETH crash (stETH-depeg cascade).
 * Replays 19 real Aave V2 liquidated positions through the live scoring engine,
 * comparing the static-floor baseline against the crash-regime escalation.
 *
 * Run:  npx tsx scripts/backtest/eth-crash-2022.ts
 */

import { computeScore } from "../../packages/scoring/src/computeScore";
import type { ScoringInput } from "../../packages/scoring/src/types";
import {
  WETH_DAILY,
  WETH_HOURLY,
  WBTC_DAILY,
} from "../../packages/scoring/tests/fixtures/ethCrash2022";
import { runBacktest, type Scorecard } from "../../packages/scoring/tests/backtest/replay";

// Fail loud if a fixture series lost a row (the replay assumes gap-free arrays).
if (WETH_HOURLY.length !== 336) throw new Error(`WETH_HOURLY len ${WETH_HOURLY.length} ≠ 336`);
if (WETH_DAILY.length !== 100) throw new Error(`WETH_DAILY len ${WETH_DAILY.length} ≠ 100`);
if (WBTC_DAILY.length !== 100) throw new Error(`WBTC_DAILY len ${WBTC_DAILY.length} ≠ 100`);

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : "—");
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

const baseline: Scorecard = runBacktest((i: ScoringInput) =>
  computeScore(i, { crashRegime: false }),
);
const improved = runBacktest((i: ScoringInput) => computeScore(i)); // crash regime on (default)

console.log("\n=== PANIK backtest — Jun-2022 ETH crash (19 real Aave V2 liquidations) ===");
console.log("Reconstruction: HF(t) = WETH(t)/WETH(t_liq), stablecoin debt ≈ $1, anchored HF≈1 at liquidation.\n");

// Per-position CRITICAL lead time, baseline → improved (sorted by debt).
console.log("wallet          debt         HF@start  CRIT lead: base → improved");
console.log("─".repeat(72));
const byWallet = new Map(baseline.results.map((r) => [r.wallet, r]));
for (const imp of [...improved.results].sort((a, b) => b.totalDebtUsd - a.totalDebtUsd)) {
  const base = byWallet.get(imp.wallet)!;
  const b = base.leadCriticalH === null ? "—" : `${base.leadCriticalH}h`;
  const i = imp.leadCriticalH === null ? "—" : `${imp.leadCriticalH}h`;
  const arrow = (imp.leadCriticalH ?? 0) > (base.leadCriticalH ?? 0) ? "  ↑" : "";
  console.log(
    `${imp.wallet.slice(0, 8)}…  ${usd(imp.totalDebtUsd).padStart(12)}  ${imp.hfAtStart
      .toFixed(2)
      .padStart(7)}   ${b.padStart(5)} → ${i.padStart(5)}${arrow}`,
  );
}
console.log("─".repeat(72));

const row = (label: string, b: string, i: string) =>
  console.log(`${label.padEnd(40)} ${b.padStart(8)}   ${i.padStart(8)}`);
console.log(`\n${"".padEnd(40)} ${"baseline".padStart(8)}   ${"improved".padStart(8)}`);
row("Caught (CRITICAL before liquidation)", `${baseline.caughtCritical}/${baseline.n}`, `${improved.caughtCritical}/${improved.n}`);
row("Median CRITICAL lead — all (h) *", fmt(baseline.medianLeadCriticalH), fmt(improved.medianLeadCriticalH));
row(
  `Median CRITICAL lead — healthy-start (h) [n=${improved.healthyStartN}]`,
  fmt(baseline.medianLeadCriticalHealthyStartH),
  fmt(improved.medianLeadCriticalHealthyStartH),
);
row("Median HF when CRITICAL fired", baseline.medianHfAtCritical.toFixed(2), improved.medianHfAtCritical.toFixed(2));
console.log(
  "\n* 'all' is right-censored at the 96h replay window: ~half the cohort was already\n" +
    "  inside the static floor 4 days out, so the honest, uncensored improvement metric is\n" +
    "  the healthy-start cohort (HF@start > 1.25) — positions that began with room to act.\n",
);
