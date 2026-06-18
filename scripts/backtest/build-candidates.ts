/**
 * Build the survivor-control candidate set from Dune query 7734090
 * (WETH-collateral / stable-debt Aave V2 owners at the crash start, tagged
 * liquidated vs survivor). All liquidated + a random survivor sample.
 *
 * Run:  node --env-file=.env --import tsx scripts/backtest/build-candidates.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const QUERY_ID = 7734090;
const SURVIVOR_SAMPLE = 160;
const key = process.env.DUNE_API_KEY;
if (!key) throw new Error("DUNE_API_KEY missing");

async function getResults(): Promise<any[]> {
  const u = `https://api.dune.com/api/v1/query/${QUERY_ID}/results?limit=5000`;
  let lastErr: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(u, { headers: { "X-Dune-API-Key": key as string }, signal: AbortSignal.timeout(40_000) });
      const j = await r.json();
      if (j?.result?.rows) return j.result.rows;
      lastErr = new Error(j?.error || "no rows");
    } catch (e) {
      lastErr = e;
    }
    await new Promise((s) => setTimeout(s, 2500 * (i + 1)));
  }
  throw lastErr;
}

(async () => {
  const rows = await getResults();
  const liquidated = rows.filter((r) => r.liquidated === true);
  const survivors = rows.filter((r) => r.liquidated !== true);

  // deterministic shuffle (seedless but stable enough) → take a survivor sample
  const sample = survivors
    .map((r) => ({ r, k: (BigInt(r.owner) % 100000n).toString() }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .slice(0, SURVIVOR_SAMPLE)
    .map((x) => x.r);

  const candidates = [...liquidated, ...sample].map((r) => ({
    owner: r.owner as string,
    liquidated: r.liquidated === true,
    firstLiqIso: r.first_liq ? new Date(r.first_liq).toISOString() : null,
  }));

  const dir = resolve(import.meta.dirname, "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "eth-crash-candidates.json"), JSON.stringify(candidates, null, 0));
  console.log(
    `candidates: ${candidates.length}  (liquidated ${liquidated.length}, survivors sampled ${sample.length} of ${survivors.length})`,
  );
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
