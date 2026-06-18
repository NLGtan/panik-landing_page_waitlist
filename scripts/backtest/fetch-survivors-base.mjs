/**
 * Base survivor HF sampler — Aave V3 on Base via archive getUserAccountData.
 * Same method as Ethereum, different pool + base-mainnet RPC (same Alchemy key,
 * which is a Base key). Reads data/<label>-candidates.json → data/<label>-hf.json.
 * Chunked + retried for the free tier. Pair with dnsfix.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs \
 *        scripts/backtest/fetch-survivors-base.mjs <label>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
const AAVE_V3_BASE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5";
const SELECTOR = "0xbf92857c"; // getUserAccountData(address)
const WAD = 10n ** 18n;
const CHUNK = 40;

// Dense 6h blocks per Base crash window (Dune 7748993).
const BASE_EVENTS = {
  "aave-aug24": {
    blocks: [
      { label: "h00", block: 17970127, iso: "2024-08-04T00:00:00Z" }, { label: "h06", block: 17980927, iso: "2024-08-04T06:00:00Z" },
      { label: "h12", block: 17991727, iso: "2024-08-04T12:00:00Z" }, { label: "h18", block: 18002527, iso: "2024-08-04T18:00:00Z" },
      { label: "h24", block: 18013327, iso: "2024-08-05T00:00:00Z" }, { label: "h30", block: 18024127, iso: "2024-08-05T06:00:00Z" },
      { label: "h36", block: 18034927, iso: "2024-08-05T12:00:00Z" }, { label: "h42", block: 18045727, iso: "2024-08-05T18:00:00Z" },
      { label: "h48", block: 18056527, iso: "2024-08-06T00:00:00Z" }, { label: "h54", block: 18067327, iso: "2024-08-06T06:00:00Z" },
      { label: "h60", block: 18078127, iso: "2024-08-06T12:00:00Z" }, { label: "h66", block: 18088927, iso: "2024-08-06T18:00:00Z" },
      { label: "h72", block: 18099727, iso: "2024-08-07T00:00:00Z" }, { label: "h78", block: 18110527, iso: "2024-08-07T06:00:00Z" },
      { label: "h84", block: 18121327, iso: "2024-08-07T12:00:00Z" }, { label: "h90", block: 18132127, iso: "2024-08-07T18:00:00Z" },
    ],
  },
};

const label = process.argv[2];
const cfg = BASE_EVENTS[label];
if (!cfg) throw new Error(`unknown base event '${label}' (have: ${Object.keys(BASE_EVENTS).join(", ")})`);
const key = process.env.ALCHEMY_API_KEY_BASE_MAINNET;
if (!key) throw new Error("ALCHEMY_API_KEY_BASE_MAINNET missing");
const url = `https://base-mainnet.g.alchemy.com/v2/${key}`;
const candidates = JSON.parse(readFileSync(resolve(DIR, `${label}-candidates.json`), "utf8"));
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function postBatch(batch) {
  let last;
  for (let a = 0; a < 7; a++) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(batch), signal: AbortSignal.timeout(45_000),
      });
      const j = await r.json();
      const arr = Array.isArray(j) ? j : null;
      const throttled = !arr || arr.some((x) => x?.error && (x.error.code === 429 || /rate|capacity|limit/i.test(x.error.message || "")));
      if (arr && !throttled) return arr;
      last = new Error(arr ? "per-item 429" : JSON.stringify(j).slice(0, 120));
    } catch (e) { last = e; }
    await sleep(1500 * (a + 1));
  }
  throw last;
}
function callFor(owner, block, id) {
  const data = SELECTOR + "000000000000000000000000" + owner.toLowerCase().replace(/^0x/, "");
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to: AAVE_V3_BASE_POOL, data }, "0x" + block.toString(16)] };
}
function decodeHf(hex) {
  if (!hex || hex.length < 2 + 64 * 6) return null;
  const raw = BigInt("0x" + hex.slice(2 + 64 * 5, 2 + 64 * 6));
  if (raw === 0n || raw > 10n ** 30n) return null;
  return Number((raw * 10000n) / WAD) / 10000;
}

(async () => {
  const hfByOwner = new Map(candidates.map((c) => [c.owner.toLowerCase(), {}]));
  for (const { label: bl, block } of cfg.blocks) {
    const batch = candidates.map((c, i) => callFor(c.owner, block, i));
    process.stdout.write(`${label} ${bl} (${block}) — ${batch.length} users… `);
    const byId = new Map();
    for (let i = 0; i < batch.length; i += CHUNK) {
      const part = await postBatch(batch.slice(i, i + CHUNK));
      for (const r of part) byId.set(r.id, r);
      await sleep(250);
    }
    let ok = 0;
    candidates.forEach((c, i) => {
      const hf = byId.get(i)?.result ? decodeHf(byId.get(i).result) : null;
      hfByOwner.get(c.owner.toLowerCase())[bl] = hf;
      if (hf !== null) ok++;
    });
    console.log(`${ok} with debt`);
  }
  const out = candidates.map((c) => ({
    owner: c.owner, liquidated: c.liquidated, firstLiqIso: c.firstLiqIso,
    hf: hfByOwner.get(c.owner.toLowerCase()),
  }));
  writeFileSync(resolve(DIR, `${label}-hf.json`), JSON.stringify(out, null, 0));
  console.log(`wrote ${out.length} → data/${label}-hf.json`);
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
