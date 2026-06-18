/**
 * Survivor-control sampler — exact Aave V2 health factors via archive RPC.
 *
 * The flow-reconstruction approach (query 7734090) is unreliable for absolute
 * position size (aggregator/proxy contracts; onBehalfOf≠user; interest), so we
 * read the protocol's own answer instead: LendingPool.getUserAccountData(user)
 * returns the exact health factor (all collateral + debt + accrued interest,
 * priced on Aave's oracle) at a historical block. One eth_call per user per
 * block, batched into a single HTTP request per block so a flaky link only needs
 * a handful of round-trips.
 *
 * Input:  scripts/backtest/data/eth-crash-candidates.json  (array of {owner, liquidated, firstLiqIso})
 * Output: scripts/backtest/data/eth-crash-hf.json          (per-user HF at each sampled block)
 *
 * Run:  node --env-file=.env --import tsx scripts/backtest/fetch-survivors-eth.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const AAVE_V2_POOL = "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9";
const SELECTOR = "0xbf92857c"; // getUserAccountData(address)
const WAD = 10n ** 18n;

// Blocks straddling the June-2022 crash legs (verified by timestamp at runtime).
const BLOCKS: { label: string; block: number }[] = [
  { label: "Jun08", block: 14935700 }, // crash start (~WETH $1819)
  { label: "Jun13", block: 14967150 }, // first big leg (~$1450)
  { label: "Jun14", block: 14974300 }, // whale-liq trough (~$1108)
  { label: "Jun18", block: 14994600 }, // deepest (~$910)
];

const key = process.env.ALCHEMY_API_KEY_BASE_MAINNET;
if (!key) throw new Error("ALCHEMY_API_KEY_BASE_MAINNET missing");
const url = `https://eth-mainnet.g.alchemy.com/v2/${key}`;

const dataDir = resolve(import.meta.dirname, "data");
const candidates: { owner: string; liquidated: boolean; firstLiqIso: string | null }[] = JSON.parse(
  readFileSync(resolve(dataDir, "eth-crash-candidates.json"), "utf8"),
);

const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
const CHUNK = 40; // keep each batch well under the free-tier compute-unit burst cap

/** POST one batch, retrying while any item is missing or rate-limited (429). */
async function postBatch(batch: any[]): Promise<any[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(45_000),
      });
      const j = (await r.json()) as any;
      const arr = Array.isArray(j) ? j : null;
      // Whole-batch throttle (object with error) or any per-item 429 → back off + retry.
      const throttled =
        !arr || arr.some((x) => x?.error && (x.error.code === 429 || /rate|capacity|limit/i.test(x.error.message || "")));
      if (arr && !throttled) return arr;
      lastErr = new Error(arr ? "per-item rate limit" : JSON.stringify(j).slice(0, 120));
    } catch (e) {
      lastErr = e;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw lastErr;
}

/** Run a block's calls in spaced chunks so the free tier doesn't throttle. */
async function callBlock(batch: any[]): Promise<Map<number, any>> {
  const byId = new Map<number, any>();
  for (let i = 0; i < batch.length; i += CHUNK) {
    const part = await postBatch(batch.slice(i, i + CHUNK));
    for (const r of part) byId.set(r.id, r);
    await sleep(250);
  }
  return byId;
}

function callFor(owner: string, block: number, id: number) {
  const data = SELECTOR + "000000000000000000000000" + owner.toLowerCase().replace(/^0x/, "");
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to: AAVE_V2_POOL, data }, "0x" + block.toString(16)] };
}

/** decode the 6th uint256 (healthFactor, wad) from getUserAccountData output. */
function decodeHf(hex: string): number | null {
  if (!hex || hex === "0x" || hex.length < 2 + 64 * 6) return null;
  const raw = BigInt("0x" + hex.slice(2 + 64 * 5, 2 + 64 * 6));
  if (raw === 0n) return null; // no debt → HF = ∞
  // cap absurd HF (no-debt sentinel is type(uint256).max)
  if (raw > 10n ** 30n) return null;
  return Number((raw * 10000n) / WAD) / 10000;
}

(async () => {
  const hfByOwner = new Map<string, Record<string, number | null>>();
  for (const c of candidates) hfByOwner.set(c.owner.toLowerCase(), {});

  for (const { label, block } of BLOCKS) {
    const batch = candidates.map((c, i) => callFor(c.owner, block, i));
    process.stdout.write(`block ${label} (${block}) — ${batch.length} users… `);
    const byId = await callBlock(batch);
    let ok = 0;
    candidates.forEach((c, i) => {
      const r = byId.get(i);
      const hf = r?.result ? decodeHf(r.result) : null;
      hfByOwner.get(c.owner.toLowerCase())![label] = hf;
      if (hf !== null) ok++;
    });
    console.log(`${ok} with debt`);
  }

  const out = candidates.map((c) => ({
    owner: c.owner,
    liquidated: c.liquidated,
    firstLiqIso: c.firstLiqIso,
    hf: hfByOwner.get(c.owner.toLowerCase()),
  }));
  mkdirSync(dirname(resolve(dataDir, "eth-crash-hf.json")), { recursive: true });
  writeFileSync(resolve(dataDir, "eth-crash-hf.json"), JSON.stringify(out, null, 0));
  console.log(`\nwrote ${out.length} users → scripts/backtest/data/eth-crash-hf.json`);
})().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
