/**
 * Reusable Base lending cohort puller (any protocol) off the unified `lending`
 * spell. Liquidated = borrowers with a liquidator in the event window; survivors
 * = borrowers active in the lookback window who were NOT liquidated (sampled).
 * Writes data/<label>-candidates.json. Direct Dune API; pair with dnsfix.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs \
 *        scripts/backtest/pull-cohort-base.mjs <label> <project> <start> <end> [survCap]
 *   e.g. ... aave-aug24 aave 2024-08-04 2024-08-08 100000
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DIR, { recursive: true });
const key = process.env.DUNE_API_KEY;
if (!key) throw new Error("DUNE_API_KEY missing");
const [label, project, start, end, survCap] = process.argv.slice(2);
if (!label || !project || !start || !end) throw new Error("usage: <label> <project> <start> <end> [survCap]");
const CAP = Number(survCap ?? 200);

// Liquidated borrowers (with first-liq time) + active-borrower universe in the 45d
// lookback. Survivors = active − liquidated. amount_usd in lending.borrow is the
// liquidator's repay (signed); we only need identities + timing here.
const SQL = `
WITH liq AS (
  SELECT borrower AS owner, min(block_time) AS first_liq
  FROM lending.borrow
  WHERE blockchain = 'base' AND project = '${project}' AND liquidator IS NOT NULL
    AND block_time >= TIMESTAMP '${start}' AND block_time < TIMESTAMP '${end}'
  GROUP BY borrower
),
active AS (
  SELECT DISTINCT borrower AS owner
  FROM lending.borrow
  WHERE blockchain = 'base' AND project = '${project}'
    AND block_time >= TIMESTAMP '${start}' - INTERVAL '45' day AND block_time < TIMESTAMP '${end}'
)
SELECT a.owner, l.owner IS NOT NULL AS liquidated, l.first_liq
FROM active a LEFT JOIN liq l ON l.owner = a.owner`;

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
async function api(path, init, attempts = 8) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`https://api.dune.com${path}`, {
        ...init, headers: { "X-Dune-API-Key": key, "content-type": "application/json", ...(init?.headers || {}) },
        signal: AbortSignal.timeout(45_000),
      });
      return await r.json();
    } catch (e) { last = e; await sleep(2000 * (i + 1)); }
  }
  throw last;
}

(async () => {
  const c = await api("/api/v1/query", {
    method: "POST",
    body: JSON.stringify({ name: `PANIK — Base ${project} cohort (${label})`, query_sql: SQL, is_private: false }),
  });
  if (!c.query_id) throw new Error("create failed: " + JSON.stringify(c).slice(0, 200));
  const ex = await api(`/api/v1/query/${c.query_id}/execute`, { method: "POST", body: JSON.stringify({ performance: "free" }) });
  if (!ex.execution_id) throw new Error("execute failed: " + JSON.stringify(ex).slice(0, 200));
  console.log(`${label}: query ${c.query_id}, exec ${ex.execution_id} …`);
  let rows = null;
  for (let i = 0; i < 75; i++) {
    const res = await api(`/api/v1/execution/${ex.execution_id}/results?limit=30000`, {});
    if (res?.state === "QUERY_STATE_COMPLETED" && res.result?.rows) { rows = res.result.rows; break; }
    if (res?.state === "QUERY_STATE_FAILED") throw new Error("failed: " + JSON.stringify(res).slice(0, 200));
    await sleep(4000);
  }
  if (!rows) throw new Error("timed out");
  const liquidated = rows.filter((r) => r.liquidated === true);
  const survivors = rows.filter((r) => r.liquidated !== true);
  const sample = survivors
    .map((r) => ({ r, k: (BigInt(r.owner) % 100000n).toString().padStart(6, "0") }))
    .sort((a, b) => (a.k < b.k ? -1 : 1)).slice(0, CAP).map((x) => x.r);
  const candidates = [...liquidated, ...sample].map((r) => ({
    owner: r.owner, liquidated: r.liquidated === true,
    firstLiqIso: r.first_liq ? new Date(r.first_liq).toISOString() : null,
  }));
  writeFileSync(resolve(DIR, `${label}-candidates.json`), JSON.stringify(candidates, null, 0));
  console.log(`${label}: ${candidates.length} candidates (liquidated ${liquidated.length}, survivors ${sample.length}/${survivors.length})`);
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
