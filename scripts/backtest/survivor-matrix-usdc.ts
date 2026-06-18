/**
 * USDC-depeg survivor matrix — the REJECTED peg-break escalation experiment.
 * USDC-collateral / non-USDC-stable-debt positions, exact HF via archive RPC at
 * 20 dense blocks through the Mar-2023 depeg; peg deviation per block from real
 * USDC hourly price (Dune 7740508). Compares baseline (static HF≤1.10 floor) vs
 * a peg term (HF≤1.25 AND USDC ≥2% below peg). Self-contained (manual flag rule,
 * matching the engine experiment) — the engine peg term was reverted.
 *
 * Result: recall 97%→97% (no gain), false-alarm 27%→38%. Rejected: the depeg
 * reprices USDC via the oracle, so HF already drops and the floor catches it.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs --import tsx \
 *        scripts/backtest/survivor-matrix-usdc.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "./events.mjs";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
const SURV_SAMPLED = 263, SURV_TOTAL = 263; // full population → precision is exact (factor 1)
const FLOOR_HF = 1.1, PEG_HF = 1.25, PEG_DEV = 0.02;
const key = process.env.DUNE_API_KEY;

const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
async function usdcHourly(): Promise<Map<string, number>> {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch("https://api.dune.com/api/v1/query/7740508/results?limit=5000", {
        headers: { "X-Dune-API-Key": key as string }, signal: AbortSignal.timeout(45_000),
      });
      const j = await r.json();
      if (j?.result?.rows)
        return new Map(j.result.rows.map((x: any) => [new Date(x.hour).toISOString().slice(0, 13), Number(x.usdc_usd)]));
    } catch { /* retry */ }
    await sleep(2500 * (i + 1));
  }
  throw new Error("USDC price unavailable");
}

interface UserHf { liquidated: boolean; firstLiqIso: string | null; hf: Record<string, number | null>; }

(async () => {
  const price = await usdcHourly();
  const blocks = EVENTS.usdc.blocks as { label: string; iso: string }[];
  const pegByLabel: Record<string, number> = {};
  for (const b of blocks) pegByLabel[b.label] = Math.max(0, 1 - (price.get(new Date(b.iso).toISOString().slice(0, 13)) ?? 1));
  const isoByLabel = Object.fromEntries(blocks.map((b) => [b.label, b.iso]));
  console.log("USDC peg deviation by block:");
  console.log("  " + blocks.map((b) => `${b.iso.slice(5, 13)}=${(pegByLabel[b.label]! * 100).toFixed(1)}%`).join("  "));

  const users: UserHf[] = JSON.parse(readFileSync(resolve(DIR, "usdc-hf.json"), "utf8"));
  const hasDebt = (u: UserHf) => {
    const exit = u.firstLiqIso ? Date.parse(u.firstLiqIso) : Infinity;
    return Object.entries(u.hf).some(([l, hf]) => hf !== null && isoByLabel[l] && Date.parse(isoByLabel[l]) < exit);
  };
  function flagged(u: UserHf, withPeg: boolean): boolean {
    const exit = u.firstLiqIso ? Date.parse(u.firstLiqIso) : Infinity;
    for (const [label, hf] of Object.entries(u.hf)) {
      if (hf === null || !isoByLabel[label] || Date.parse(isoByLabel[label]) >= exit) continue;
      if (hf <= FLOOR_HF) return true;
      if (withPeg && pegByLabel[label]! >= PEG_DEV && hf <= PEG_HF) return true;
    }
    return false;
  }

  const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(0) + "%" : "—");
  for (const [name, withPeg] of [["BASELINE (static floor)", false], ["PEG-REGIME (rejected)", true]] as const) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const u of users) {
      if (!hasDebt(u)) continue;
      const f = flagged(u, withPeg);
      if (u.liquidated) f ? tp++ : fn++;
      else f ? fp++ : tn++;
    }
    const fpAdj = fp * (SURV_TOTAL / SURV_SAMPLED);
    console.log(`\n${name}`);
    console.log(`  TP ${tp}  FN ${fn}  FP ${fp}  TN ${tn}`);
    console.log(`  recall ${pct(tp / (tp + fn))} · false-alarm ${pct(fp / (fp + tn))} · base-rate-adj precision ${pct(tp / (tp + fpAdj))}`);
  }
  console.log("");
})();
