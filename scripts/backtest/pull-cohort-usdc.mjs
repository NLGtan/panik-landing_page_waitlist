/**
 * USDC-collateral / non-USDC-stable-debt cohort for the Mar-2023 depeg (Aave V2).
 * These are the positions the depeg actually endangers: USDC collateral loses
 * value while USDT/DAI debt holds $1, so HF drops with the peg. Direct Dune API
 * (pair with dnsfix). Writes data/usdc-candidates.json.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs scripts/backtest/pull-cohort-usdc.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DIR, { recursive: true });
const key = process.env.DUNE_API_KEY;
if (!key) throw new Error("DUNE_API_KEY missing");
const START = "2023-03-09", END = "2023-03-14";

const SQL = `WITH stbl AS (
  SELECT * FROM (VALUES
    (0xdac17f958d2ee523a2206206994597c13d831ec7, 6),  -- USDT
    (0x6b175474e89094c44da98b954eedeac495271d0f, 18), -- DAI
    (0x57ab1ec28d129707052df4df418d58a2d46d5f51, 18), -- sUSD
    (0x0000000000085d4780b73119b644ae5ecd22b376, 18), -- TUSD
    (0x853d955acef822db058eb8505911ed77f175b99e, 18), -- FRAX
    (0x4fabb145d64652a948d72533023f6e7a623c7c53, 18)  -- BUSD (NB: excludes USDC debt)
  ) AS t(addr, dec)
),
usdc AS (SELECT 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 AS a),
flows AS (
  SELECT onBehalfOf AS owner, CAST(amount AS double)/1e6 AS coll_d, 0.0 AS debt_d
  FROM aave_v2_ethereum.lendingpool_evt_deposit
  WHERE reserve = (SELECT a FROM usdc) AND evt_block_time < TIMESTAMP '${START}'
  UNION ALL
  SELECT "user", -CAST(amount AS double)/1e6, 0.0 FROM aave_v2_ethereum.lendingpool_evt_withdraw
  WHERE reserve = (SELECT a FROM usdc) AND evt_block_time < TIMESTAMP '${START}'
  UNION ALL
  SELECT b.onBehalfOf, 0.0, CAST(b.amount AS double)/POWER(10, s.dec)
  FROM aave_v2_ethereum.lendingpool_evt_borrow b JOIN stbl s ON b.reserve = s.addr
  WHERE b.evt_block_time < TIMESTAMP '${START}'
  UNION ALL
  SELECT r."user", 0.0, -CAST(r.amount AS double)/POWER(10, s.dec)
  FROM aave_v2_ethereum.lendingpool_evt_repay r JOIN stbl s ON r.reserve = s.addr
  WHERE r.evt_block_time < TIMESTAMP '${START}'
),
pos AS (SELECT owner, SUM(coll_d) AS coll_amt, SUM(debt_d) AS debt_usd FROM flows GROUP BY owner),
liq AS (
  SELECT "user" AS owner, min(evt_block_time) AS first_liq
  FROM aave_v2_ethereum.lendingpool_evt_liquidationcall
  WHERE collateralAsset = (SELECT a FROM usdc)
    AND evt_block_time >= TIMESTAMP '${START}' AND evt_block_time < TIMESTAMP '${END}'
  GROUP BY "user"
)
SELECT p.owner, round(p.coll_amt) AS coll_amt, round(p.debt_usd) AS debt_usd,
  l.owner IS NOT NULL AS liquidated, l.first_liq
FROM pos p LEFT JOIN liq l ON l.owner = p.owner
WHERE p.coll_amt > 50000 AND p.debt_usd > 10000
ORDER BY p.debt_usd DESC`;

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
    body: JSON.stringify({ name: "PANIK — USDC-collateral cohort (Mar 2023 depeg)", query_sql: SQL, is_private: false }),
  });
  const qid = c.query_id;
  if (!qid) throw new Error("create failed: " + JSON.stringify(c).slice(0, 200));
  const ex = await api(`/api/v1/query/${qid}/execute`, { method: "POST", body: JSON.stringify({ performance: "free" }) });
  if (!ex.execution_id) throw new Error("execute failed: " + JSON.stringify(ex).slice(0, 200));
  console.log(`query ${qid}, execution ${ex.execution_id} …`);
  let rows = null;
  for (let i = 0; i < 60; i++) {
    const res = await api(`/api/v1/execution/${ex.execution_id}/results?limit=5000`, {});
    if (res?.state === "QUERY_STATE_COMPLETED" && res.result?.rows) { rows = res.result.rows; break; }
    if (res?.state === "QUERY_STATE_FAILED") throw new Error("failed: " + JSON.stringify(res).slice(0, 200));
    await sleep(4000);
  }
  if (!rows) throw new Error("timed out");
  const liquidated = rows.filter((r) => r.liquidated === true);
  const survivors = rows.filter((r) => r.liquidated !== true);
  const sample = survivors
    .map((r) => ({ r, k: (BigInt(r.owner) % 100000n).toString().padStart(6, "0") }))
    .sort((a, b) => (a.k < b.k ? -1 : 1)).slice(0, Number(process.argv[2] ?? 200)).map((x) => x.r);
  const candidates = [...liquidated, ...sample].map((r) => ({
    owner: r.owner, liquidated: r.liquidated === true,
    firstLiqIso: r.first_liq ? new Date(r.first_liq).toISOString() : null,
  }));
  writeFileSync(resolve(DIR, "usdc-candidates.json"), JSON.stringify(candidates, null, 0));
  console.log(`usdc: ${candidates.length} candidates (liquidated ${liquidated.length}, survivors ${sample.length}/${survivors.length})`);
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
