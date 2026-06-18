/**
 * Survivor-control confusion matrix — the false-positive rate the catch-rate
 * alone can't show. Consumes exact Aave V2 health factors (scripts/backtest/
 * fetch-survivors-eth.ts) sampled across the June-2022 crash.
 *
 * During the crash S_asset_risk ≥ 60 holds at every sampled block, so the
 * crash-regime flag reduces to HF ≤ 1.35 and the static-floor (baseline) flag to
 * HF ≤ 1.10. A position is "flagged" if it reaches the threshold at any block
 * before it exits (liquidation) or before the window ends (survivor).
 *
 * Run:  npx tsx scripts/backtest/survivor-matrix.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BLOCK_ISO: Record<string, string> = {
  Jun08: "2022-06-08T12:00:00Z",
  Jun13: "2022-06-13T12:00:00Z",
  Jun14: "2022-06-14T03:00:00Z",
  Jun18: "2022-06-18T20:00:00Z",
};

interface UserHf {
  owner: string;
  liquidated: boolean;
  firstLiqIso: string | null;
  hf: Record<string, number | null>;
}

const users: UserHf[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "data", "eth-crash-hf.json"), "utf8"),
);

/** Min HF over blocks the user was still in the position (before liquidation). */
function minHfBeforeExit(u: UserHf): number | null {
  const exit = u.firstLiqIso ? Date.parse(u.firstLiqIso) : Infinity;
  let min: number | null = null;
  for (const [label, hf] of Object.entries(u.hf)) {
    if (hf === null) continue;
    if (Date.parse(BLOCK_ISO[label] as string) >= exit) continue; // after they were liquidated
    if (min === null || hf < min) min = hf;
  }
  return min;
}

function matrix(flagThreshold: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0, noDebt = 0;
  for (const u of users) {
    const minHf = minHfBeforeExit(u);
    if (minHf === null) {
      noDebt++; // never had debt in the sampled window → not in the borrower universe
      continue;
    }
    const flagged = minHf <= flagThreshold;
    if (u.liquidated) flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const recall = tp + fn ? tp / (tp + fn) : NaN;
  const fpr = fp + tn ? fp / (fp + tn) : NaN;
  return { tp, fp, fn, tn, noDebt, precision, recall, fpr };
}

const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(0) + "%" : "—");

console.log(`\n=== Survivor-control confusion matrix (n=${users.length} candidates) ===`);
console.log("Exact Aave V2 health factors via archive RPC; crash regime ⇒ flag at HF≤1.35.\n");

for (const [name, thr] of [
  ["Baseline (static floor, HF≤1.10)", 1.1],
  ["HF≤1.25 (middle option)", 1.25],
  ["Crash-regime (HF≤1.35)", 1.35],
] as const) {
  const m = matrix(thr);
  console.log(`${name}`);
  console.log(`  TP ${m.tp}  FN ${m.fn}  FP ${m.fp}  TN ${m.tn}   (excluded ${m.noDebt} non-borrowers)`);
  console.log(`  Recall ${pct(m.recall)}  ·  Precision ${pct(m.precision)}  ·  False-alarm rate ${pct(m.fpr)}\n`);
}

// Precision above is inflated by the candidate mix (400 liquidated : 160 survivors).
// The transferable, base-rate-free metrics are RECALL and FALSE-ALARM RATE.
// Re-weight precision to the real WETH-cohort base rate (≈400 liquidated : 1674 survivors).
const SURV_TOTAL = 1674;
const SURV_SAMPLED = 160;
console.log("Population-adjusted precision (survivors up-weighted to the true base rate):");
for (const [name, thr] of [["Baseline HF≤1.10", 1.1], ["HF≤1.25", 1.25], ["Crash HF≤1.35", 1.35]] as const) {
  const m = matrix(thr);
  const fpScaled = m.fp * (SURV_TOTAL / SURV_SAMPLED);
  const adjPrecision = m.tp / (m.tp + fpScaled);
  console.log(`  ${name.padEnd(18)} ≈ ${pct(adjPrecision)}  (of flagged positions, share that truly liquidated)`);
}
console.log("");
