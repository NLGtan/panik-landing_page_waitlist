/**
 * Multi-event survivor confusion matrix — pools the June-2022, UST/LUNA, and FTX
 * crashes. During each crash S_asset_risk ≥ 60 holds (verified separately), so
 * the crash-regime flag reduces to HF ≤ threshold. Reports per-event and pooled
 * recall / false-alarm / precision, plus the threshold curve and a base-rate-
 * adjusted precision.
 *
 * Run: npx tsx scripts/backtest/survivor-matrix-multi.mjs   (no network)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "./events.mjs";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
// June data was pulled before the multi-event rename.
const FILES = { june: "eth-crash-hf.json", ust: "ust-hf.json", ftx: "ftx-hf.json" };
// Survivor sample size vs the true survivor population (for base-rate adjustment).
const SURV = { june: [160, 1674], ust: [160, 1882], ftx: [160, 2220] };

function minHfBeforeExit(u, isoByLabel) {
  const exit = u.firstLiqIso ? Date.parse(u.firstLiqIso) : Infinity;
  let min = null;
  for (const [label, hf] of Object.entries(u.hf)) {
    if (hf === null) continue;
    if (Date.parse(isoByLabel[label]) >= exit) continue;
    if (min === null || hf < min) min = hf;
  }
  return min;
}

function load(event) {
  const users = JSON.parse(readFileSync(resolve(DIR, FILES[event]), "utf8"));
  const isoByLabel = Object.fromEntries(EVENTS[event].blocks.map((b) => [b.label, b.iso]));
  return users.map((u) => ({ liquidated: u.liquidated, minHf: minHfBeforeExit(u, isoByLabel) }));
}

function matrix(rows, thr) {
  let tp = 0, fp = 0, fn = 0, tn = 0, noDebt = 0;
  for (const r of rows) {
    if (r.minHf === null) { noDebt++; continue; }
    const flagged = r.minHf <= thr;
    if (r.liquidated) flagged ? tp++ : fn++;
    else flagged ? fp++ : tn++;
  }
  return { tp, fp, fn, tn, noDebt };
}
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(0) + "%" : "—");
function rates(m) {
  return {
    recall: m.tp + m.fn ? m.tp / (m.tp + m.fn) : NaN,
    fpr: m.fp + m.tn ? m.fp / (m.fp + m.tn) : NaN,
    precision: m.tp + m.fp ? m.tp / (m.tp + m.fp) : NaN,
  };
}

const events = ["june", "ust", "ftx"];
const byEvent = Object.fromEntries(events.map((e) => [e, load(e)]));
const pooled = events.flatMap((e) => byEvent[e]);

console.log("\n=== Multi-event survivor confusion matrix (flag = HF ≤ 1.25 during crash) ===\n");
console.log("event   liq  surv   recall  false-alarm  precision");
console.log("─".repeat(58));
for (const e of events) {
  const m = matrix(byEvent[e], 1.25);
  const r = rates(m);
  console.log(
    `${e.padEnd(6)} ${String(m.tp + m.fn).padStart(4)} ${String(m.fp + m.tn).padStart(5)}   ` +
      `${pct(r.recall).padStart(6)}  ${pct(r.fpr).padStart(11)}  ${pct(r.precision).padStart(9)}`,
  );
}
const pm = matrix(pooled, 1.25);
const pr = rates(pm);
console.log("─".repeat(58));
console.log(
  `POOLED ${String(pm.tp + pm.fn).padStart(4)} ${String(pm.fp + pm.tn).padStart(5)}   ` +
    `${pct(pr.recall).padStart(6)}  ${pct(pr.fpr).padStart(11)}  ${pct(pr.precision).padStart(9)}`,
);

console.log("\nThreshold curve on the pooled set:");
for (const thr of [1.1, 1.2, 1.25, 1.3, 1.35]) {
  const m = matrix(pooled, thr);
  const r = rates(m);
  // base-rate-adjusted precision: up-weight survivors per-event to the true population
  let tpA = 0, fpA = 0;
  for (const e of events) {
    const me = matrix(byEvent[e], thr);
    const w = SURV[e][1] / SURV[e][0];
    tpA += me.tp; fpA += me.fp * w;
  }
  const adjP = tpA + fpA ? tpA / (tpA + fpA) : NaN;
  console.log(`  HF≤${thr.toFixed(2)}  recall ${pct(r.recall).padStart(4)}  false-alarm ${pct(r.fpr).padStart(4)}  precision ${pct(r.precision).padStart(4)}  pop-adj-precision ${pct(adjP).padStart(4)}`);
}
console.log("");
