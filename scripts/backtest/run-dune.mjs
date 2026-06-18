/**
 * Robust ad-hoc Dune runner via the HTTP API (bypasses the flaky MCP transport).
 * Reads SQL from a file, creates+executes a free query, polls, prints rows JSON.
 * Pair with dnsfix.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs \
 *        scripts/backtest/run-dune.mjs <sqlFile> [limit]
 */
import { readFileSync } from "node:fs";

const key = process.env.DUNE_API_KEY;
if (!key) throw new Error("DUNE_API_KEY missing");
const [sqlFile, limit] = process.argv.slice(2);
if (!sqlFile) throw new Error("usage: run-dune.mjs <sqlFile> [limit]");
const SQL = readFileSync(sqlFile, "utf8");

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
  const c = await api("/api/v1/query", { method: "POST", body: JSON.stringify({ name: "PANIK adhoc", query_sql: SQL, is_private: false }) });
  if (!c.query_id) throw new Error("create failed: " + JSON.stringify(c).slice(0, 200));
  const ex = await api(`/api/v1/query/${c.query_id}/execute`, { method: "POST", body: JSON.stringify({ performance: "free" }) });
  if (!ex.execution_id) throw new Error("execute failed: " + JSON.stringify(ex).slice(0, 200));
  console.error(`query ${c.query_id}, exec ${ex.execution_id} …`);
  for (let i = 0; i < 75; i++) {
    const res = await api(`/api/v1/execution/${ex.execution_id}/results?limit=${limit ?? 200}`, {});
    if (res?.state === "QUERY_STATE_COMPLETED" && res.result?.rows) {
      console.log(JSON.stringify(res.result.rows, null, 0));
      console.error(`rows: ${res.result.rows.length}  (query ${c.query_id})`);
      return;
    }
    if (res?.state === "QUERY_STATE_FAILED") throw new Error("failed: " + JSON.stringify(res).slice(0, 1200));
    await sleep(4000);
  }
  throw new Error("timed out");
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
