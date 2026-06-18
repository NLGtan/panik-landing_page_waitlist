/**
 * Pull a WETH-collateral / stable-debt cohort for any crash window via the Dune
 * HTTP API (robust to the flaky MCP link; pair with the dnsfix preload).
 * Creates the parameterized query once (id cached in data/cohort-query-id.json),
 * then executes it per window and writes data/<label>-candidates.json.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs \
 *        scripts/backtest/pull-cohort.mjs <label> <start_ts> <end_ts>
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DIR, { recursive: true });
const key = process.env.DUNE_API_KEY;
if (!key) throw new Error("DUNE_API_KEY missing");

const [label, start, end, sampleArg] = process.argv.slice(2);
const SURVIVOR_CAP = Number(sampleArg ?? 160); // 100000 = full population (no sampling)
if (!label || !start || !end) throw new Error("usage: pull-cohort.mjs <label> <start_ts> <end_ts>");

const SQL = `WITH stbl AS (
  SELECT * FROM (VALUES
    (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48, 6), (0xdac17f958d2ee523a2206206994597c13d831ec7, 6),
    (0x6b175474e89094c44da98b954eedeac495271d0f, 18), (0x57ab1ec28d129707052df4df418d58a2d46d5f51, 18),
    (0x0000000000085d4780b73119b644ae5ecd22b376, 18), (0x853d955acef822db058eb8505911ed77f175b99e, 18),
    (0x4fabb145d64652a948d72533023f6e7a623c7c53, 18)
  ) AS t(addr, dec)
),
weth AS (SELECT 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 AS a),
flows AS (
  SELECT onBehalfOf AS owner, CAST(amount AS double)/1e18 AS weth_d, 0.0 AS debt_d
  FROM aave_v2_ethereum.lendingpool_evt_deposit
  WHERE reserve = (SELECT a FROM weth) AND evt_block_time < TIMESTAMP '{{start_ts}}'
  UNION ALL
  SELECT "user", -CAST(amount AS double)/1e18, 0.0 FROM aave_v2_ethereum.lendingpool_evt_withdraw
  WHERE reserve = (SELECT a FROM weth) AND evt_block_time < TIMESTAMP '{{start_ts}}'
  UNION ALL
  SELECT b.onBehalfOf, 0.0, CAST(b.amount AS double)/POWER(10, s.dec)
  FROM aave_v2_ethereum.lendingpool_evt_borrow b JOIN stbl s ON b.reserve = s.addr
  WHERE b.evt_block_time < TIMESTAMP '{{start_ts}}'
  UNION ALL
  SELECT r."user", 0.0, -CAST(r.amount AS double)/POWER(10, s.dec)
  FROM aave_v2_ethereum.lendingpool_evt_repay r JOIN stbl s ON r.reserve = s.addr
  WHERE r.evt_block_time < TIMESTAMP '{{start_ts}}'
),
pos AS (SELECT owner, SUM(weth_d) AS weth_amt, SUM(debt_d) AS debt_usd FROM flows GROUP BY owner),
liq AS (
  SELECT "user" AS owner, min(evt_block_time) AS first_liq
  FROM aave_v2_ethereum.lendingpool_evt_liquidationcall
  WHERE collateralAsset = (SELECT a FROM weth)
    AND evt_block_time >= TIMESTAMP '{{start_ts}}' AND evt_block_time < TIMESTAMP '{{end_ts}}'
  GROUP BY "user"
)
SELECT p.owner, round(p.weth_amt,4) AS weth_amt, round(p.debt_usd) AS debt_usd,
  l.owner IS NOT NULL AS liquidated, l.first_liq
FROM pos p LEFT JOIN liq l ON l.owner = p.owner
WHERE p.weth_amt > 25 AND p.debt_usd > 10000
ORDER BY p.debt_usd DESC`;

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
async function api(path, init, attempts = 8) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`https://api.dune.com${path}`, {
        ...init,
        headers: { "X-Dune-API-Key": key, "content-type": "application/json", ...(init?.headers || {}) },
        signal: AbortSignal.timeout(45_000),
      });
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

(async () => {
  // Create (once) the parameterized query, cache its id.
  const idFile = resolve(DIR, "cohort-query-id.json");
  let queryId = existsSync(idFile) ? JSON.parse(readFileSync(idFile, "utf8")).id : null;
  if (!queryId) {
    const c = await api("/api/v1/query", {
      method: "POST",
      body: JSON.stringify({
        name: "PANIK — WETH/stable cohort (param window)",
        query_sql: SQL,
        parameters: [
          { key: "start_ts", type: "text", value: start },
          { key: "end_ts", type: "text", value: end },
        ],
        is_private: false,
      }),
    });
    queryId = c.query_id;
    if (!queryId) throw new Error("create failed: " + JSON.stringify(c).slice(0, 200));
    writeFileSync(idFile, JSON.stringify({ id: queryId }));
    console.log(`created query ${queryId}`);
  }

  // Execute for this window.
  const ex = await api(`/api/v1/query/${queryId}/execute`, {
    method: "POST",
    body: JSON.stringify({ performance: "free", query_parameters: { start_ts: start, end_ts: end } }),
  });
  const execId = ex.execution_id;
  if (!execId) throw new Error("execute failed: " + JSON.stringify(ex).slice(0, 200));
  console.log(`${label}: execution ${execId} …`);

  // Poll for completion.
  let rows = null;
  for (let i = 0; i < 60; i++) {
    const res = await api(`/api/v1/execution/${execId}/results?limit=5000`, {});
    if (res?.state === "QUERY_STATE_COMPLETED" && res.result?.rows) { rows = res.result.rows; break; }
    if (res?.state === "QUERY_STATE_FAILED") throw new Error("query failed: " + JSON.stringify(res).slice(0, 200));
    await sleep(4000);
  }
  if (!rows) throw new Error("timed out waiting for results");

  const liquidated = rows.filter((r) => r.liquidated === true);
  const survivors = rows.filter((r) => r.liquidated !== true);
  const sample = survivors
    .map((r) => ({ r, k: (BigInt(r.owner) % 100000n).toString().padStart(6, "0") }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .slice(0, SURVIVOR_CAP)
    .map((x) => x.r);
  const candidates = [...liquidated, ...sample].map((r) => ({
    owner: r.owner, liquidated: r.liquidated === true,
    firstLiqIso: r.first_liq ? new Date(r.first_liq).toISOString() : null,
  }));
  writeFileSync(resolve(DIR, `${label}-candidates.json`), JSON.stringify(candidates, null, 0));
  console.log(`${label}: ${candidates.length} candidates (liquidated ${liquidated.length}, survivors ${sample.length}/${survivors.length})`);
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
