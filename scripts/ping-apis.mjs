/**
 * PANIK — API connectivity check.
 * Run:  node --env-file=.env scripts/ping-apis.mjs
 * Pings every external service in .env and reports PASS/FAIL.
 * Never prints key material.
 */

const results = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: err.message });
  }
}

async function getJson(url, options = {}, timeoutMs = 15000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env`);
  return v;
}

// ── 1. CoinGecko (Demo plan key) ─────────────────────────────────────────
// Tests the exact endpoint the scoring engine uses: 30d daily price history
// (S_asset_risk inputs). The /key introspection endpoint is Pro-only — don't use it.
await check("CoinGecko", async () => {
  const key = requireEnv("COINGECKO_API_KEY");
  const { status, body } = await getJson(
    "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=30&interval=daily",
    { headers: { "x-cg-demo-api-key": key } },
  );
  if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(body).slice(0, 120)}`);
  const prices = body.prices ?? [];
  const last = prices.at(-1)?.[1];
  return `30d ETH history: ${prices.length} points, latest $${last?.toFixed(2)}`;
});

// ── 2. DefiLlama (no key) ────────────────────────────────────────────────
await check("DefiLlama", async () => {
  const { status, body } = await getJson("https://api.llama.fi/tvl/aave-v3");
  if (status !== 200 || typeof body !== "number") throw new Error(`HTTP ${status}`);
  return `aave-v3 TVL = $${(body / 1e9).toFixed(2)}B`;
});

// ── 3. Alchemy Base Mainnet (JSON-RPC) ───────────────────────────────────
async function rpc(url, method, params = []) {
  const { status, body } = await getJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (status !== 200 || body.error) {
    throw new Error(`HTTP ${status}: ${body.error?.message ?? "unknown RPC error"}`);
  }
  return body.result;
}

const MAINNET_URL = () =>
  `https://base-mainnet.g.alchemy.com/v2/${requireEnv("ALCHEMY_API_KEY_BASE_MAINNET")}`;

await check("Alchemy Base Mainnet", async () => {
  const block = await rpc(MAINNET_URL(), "eth_blockNumber");
  return `block #${parseInt(block, 16).toLocaleString()}`;
});

// ── 4. Alchemy Base Sepolia (JSON-RPC) ───────────────────────────────────
await check("Alchemy Base Sepolia", async () => {
  const url = `https://base-sepolia.g.alchemy.com/v2/${requireEnv("ALCHEMY_API_KEY_BASE_SEPOLIA")}`;
  const block = await rpc(url, "eth_blockNumber");
  return `block #${parseInt(block, 16).toLocaleString()}`;
});

// ── 5. Chainlink ETH/USD feed on Base (real eth_call through Alchemy) ────
// Proves the full SYSTEM_ARCHITECTURE §3 read path: backend → RPC → protocol contract.
await check("Chainlink ETH/USD (via Alchemy)", async () => {
  const FEED = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"; // ETH/USD aggregator, Base mainnet
  const data = await rpc(MAINNET_URL(), "eth_call", [
    { to: FEED, data: "0xfeaf968c" }, // latestRoundData()
    "latest",
  ]);
  // returns (roundId, answer int256, startedAt, updatedAt, answeredInRound) — 5×32 bytes
  const answer = BigInt("0x" + data.slice(2 + 64, 2 + 128));
  const updatedAt = Number(BigInt("0x" + data.slice(2 + 192, 2 + 256)));
  const ageMin = Math.round((Date.now() / 1000 - updatedAt) / 60);
  return `ETH = $${(Number(answer) / 1e8).toFixed(2)} (feed updated ${ageMin}m ago)`;
});

// ── 6. Dune (REST API key) ───────────────────────────────────────────────
// No free ping endpoint; an invalid key always returns 401, so any other
// status on a known endpoint proves the key authenticates. Costs no credits.
await check("Dune", async () => {
  const key = requireEnv("DUNE_API_KEY");
  const { status, body } = await getJson(
    "https://api.dune.com/api/v1/query/1/results?limit=1",
    { headers: { "X-Dune-API-Key": key } },
  );
  if (status === 401) throw new Error(`HTTP 401: ${body.error ?? "invalid API key"}`);
  return `key authenticates (HTTP ${status} on probe query — expected non-401)`;
});

// ── 7. WalletConnect / Reown project ID ──────────────────────────────────
await check("WalletConnect (Reown)", async () => {
  const id = requireEnv("VITE_WALLETCONNECT_PROJECT_ID");
  const { status, body } = await getJson(
    `https://explorer-api.walletconnect.com/v3/wallets?projectId=${id}&entries=1&page=1`,
  );
  if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(body).slice(0, 120)}`);
  return `project ID accepted by explorer API (${body.total ?? "?"} wallets listable)`;
});

// ── 8. Goldsky (CLI token auth — no public REST ping endpoint) ───────────
await check("Goldsky", async () => {
  const key = requireEnv("GOLDSKY_API_KEY");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const { stdout, stderr } = await run(
    "npx",
    ["-y", "@goldskycom/cli", "subgraph", "list", "--token", key],
    { shell: true, timeout: 90_000 },
  );
  const out = `${stdout}\n${stderr}`;
  if (/unauthorized|invalid token|forbidden|not logged in/i.test(out)) {
    throw new Error("API key rejected by Goldsky");
  }
  const project = process.env.GOLDSKY_PROJECT_ID ?? "?";
  return `key authenticates (project ${project.slice(0, 16)}…, ${
    /no subgraphs found/i.test(out) ? "no subgraphs deployed yet" : "subgraphs found"
  })`;
});

// ── 9. Supabase Auth (project URL + publishable key) ─────────────────────
await check("Supabase (publishable key)", async () => {
  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const { status, body } = await getJson(`${url}/auth/v1/health`, {
    headers: { apikey: key },
  });
  if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(body).slice(0, 100)}`);
  return `auth service healthy (${body.name ?? "GoTrue"} ${body.version ?? ""})`.trim();
});

// ── 10. Supabase REST (secret key — worker-side) ─────────────────────────
await check("Supabase (secret key)", async () => {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SECRET_KEY");
  const { status } = await getJson(`${url}/rest/v1/`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (status !== 200) throw new Error(`HTTP ${status} — key rejected by PostgREST`);
  return "REST API accepts the secret key (OpenAPI root returned)";
});

// ── 11. Supabase direct Postgres (Goldsky Mirror sink path) ──────────────
// TCP reachability only — full auth is exercised when the worker/pipeline
// connects with a real pg client. Proves host/port/DNS are right.
await check("Supabase DB (direct 5432)", async () => {
  const dbUrl = new URL(requireEnv("SUPABASE_DB_URL"));
  const net = await import("node:net");
  await new Promise((resolve, reject) => {
    const socket = net.connect(
      { host: dbUrl.hostname, port: Number(dbUrl.port || 5432), timeout: 8000 },
      () => {
        socket.end();
        resolve(undefined);
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TCP connect timeout"));
    });
    socket.on("error", reject);
  });
  const viaPooler = dbUrl.hostname.includes("pooler");
  return `${dbUrl.hostname}:${dbUrl.port || 5432} reachable (${
    viaPooler ? "session pooler — IPv4 + long-lived OK" : "direct — requires IPv6"
  })`;
});

// ── Report ───────────────────────────────────────────────────────────────
console.log("\nPANIK API connectivity check\n" + "─".repeat(72));
for (const r of results) {
  const mark = r.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.name.padEnd(32)} ${String(r.ms + "ms").padStart(7)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log("─".repeat(72));
console.log(failed === 0 ? "All services reachable." : `${failed} service(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
