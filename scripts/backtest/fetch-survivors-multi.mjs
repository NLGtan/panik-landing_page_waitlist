/**
 * Multi-event survivor HF sampler. Reads data/<event>-candidates.json, reads
 * exact Aave V2 health factors via archive getUserAccountData at the event's
 * crash blocks, writes data/<event>-hf.json. Chunked + retried so the free
 * Alchemy tier doesn't throttle. Pair with the dnsfix preload.
 *
 * Run: node --env-file=.env --import ./scripts/backtest/dnsfix.mjs \
 *        scripts/backtest/fetch-survivors-multi.mjs <event>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS, AAVE_V2_POOL } from "./events.mjs";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "data");
const SELECTOR = "0xbf92857c"; // getUserAccountData(address)
const WAD = 10n ** 18n;
const CHUNK = 40;

const event = process.argv[2];
const cfg = EVENTS[event];
if (!cfg) throw new Error(`unknown event '${event}' (have: ${Object.keys(EVENTS).join(", ")})`);
const key = process.env.ALCHEMY_API_KEY_BASE_MAINNET;
if (!key) throw new Error("ALCHEMY_API_KEY_BASE_MAINNET missing");
const url = `https://eth-mainnet.g.alchemy.com/v2/${key}`;

const candidates = JSON.parse(readFileSync(resolve(DIR, `${event}-candidates.json`), "utf8"));
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
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to: AAVE_V2_POOL, data }, "0x" + block.toString(16)] };
}
function decodeHf(hex) {
  if (!hex || hex.length < 2 + 64 * 6) return null;
  const raw = BigInt("0x" + hex.slice(2 + 64 * 5, 2 + 64 * 6));
  if (raw === 0n || raw > 10n ** 30n) return null;
  return Number((raw * 10000n) / WAD) / 10000;
}

(async () => {
  const hfByOwner = new Map(candidates.map((c) => [c.owner.toLowerCase(), {}]));
  for (const { label, block } of cfg.blocks) {
    const batch = candidates.map((c, i) => callFor(c.owner, block, i));
    process.stdout.write(`${event} ${label} (${block}) — ${batch.length} users… `);
    const byId = new Map();
    for (let i = 0; i < batch.length; i += CHUNK) {
      const part = await postBatch(batch.slice(i, i + CHUNK));
      for (const r of part) byId.set(r.id, r);
      await sleep(250);
    }
    let ok = 0;
    candidates.forEach((c, i) => {
      const hf = byId.get(i)?.result ? decodeHf(byId.get(i).result) : null;
      hfByOwner.get(c.owner.toLowerCase())[label] = hf;
      if (hf !== null) ok++;
    });
    console.log(`${ok} with debt`);
  }
  const out = candidates.map((c) => ({
    owner: c.owner, liquidated: c.liquidated, firstLiqIso: c.firstLiqIso,
    hf: hfByOwner.get(c.owner.toLowerCase()),
  }));
  writeFileSync(resolve(DIR, `${event}-hf.json`), JSON.stringify(out, null, 0));
  console.log(`wrote ${out.length} → data/${event}-hf.json`);
})().catch((e) => { console.error("FAIL:", e?.message || e); process.exit(1); });
