/**
 * PANIK — local scoring API (dev).
 * Run:  npm run dev:api   (then `npm run dev` and open /app.html)
 * Serves live scores to the panik-core UI. Keys stay server-side — the
 * browser only ever sees score JSON, mirroring the production worker split.
 *
 * Endpoints:
 *   GET /api/health
 *   GET /api/scores       live wallet positions (Supabase registry → chain)
 *   GET /api/compass      the 6 Compass preset scenarios, scored live
 *   GET /api/prospective  ?protocol&symbol&collateralUsd&borrowUsd (Watch sliders)
 *   GET /api/profile      ?wallet  DeFi-persona prediction (Dune history → AI)
 *   GET /api/chain        real Base block number + gas price
 */

import express from "express";
import pg from "pg";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  AaveActiveReader,
  ActiveAdapter,
  CoinGeckoProvider,
  CompoundActiveReader,
  DefiLlamaProvider,
  DuneHistoryProvider,
  MARKETS,
  MoonwellActiveReader,
  MorphoActiveReader,
  OpenRouterNarrator,
  profileWallet,
  scoreProspective,
  statusFor,
  type ActiveScore,
  type Protocol,
  type PublicClientLike,
  type RiskProfile,
  type WalletProfile,
} from "../packages/scoring/src/index";

const PORT = Number(process.env.PANIK_API_PORT ?? 8787);
const cgKey = process.env.COINGECKO_API_KEY;
const alchemyKey = process.env.ALCHEMY_API_KEY_BASE_MAINNET;
const dbUrl = process.env.SUPABASE_DB_URL;
// Persona profiler keys are OPTIONAL — the rest of the API runs without them;
// /api/profile reports 503 if Dune is unconfigured, and narration falls back
// to deterministic prose if OpenRouter is absent.
const duneKey = process.env.DUNE_API_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;
if (!cgKey || !alchemyKey || !dbUrl) {
  console.error("Missing env (COINGECKO_API_KEY / ALCHEMY_API_KEY_BASE_MAINNET / SUPABASE_DB_URL)");
  process.exit(1);
}

const rawClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`),
});
const chain = rawClient as unknown as PublicClientLike;

const providers = {
  assetRisk: new CoinGeckoProvider(cgKey),
  systemic: new DefiLlamaProvider(),
};

const adapter = new ActiveAdapter(
  [
    new AaveActiveReader(chain),
    new MoonwellActiveReader(chain),
    new CompoundActiveReader(chain),
    new MorphoActiveReader(), // official Morpho API (market discovery needs an index)
  ],
  providers,
  (err) => console.error(`reader failed (other protocols continue): ${(err as Error).message.slice(0, 120)}`),
);

// Persona profiler (analytics tier — once-per-wallet, cached; NOT the live loop).
const history = duneKey ? new DuneHistoryProvider(duneKey) : null;
const narrator = openRouterKey ? new OpenRouterNarrator(openRouterKey) : undefined;

const db = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 2,
  // The ap-northeast-2 (Seoul) pooler cold-connects in ~5s from here; 8s left no
  // headroom for jitter, which is what produced the connection-timeout crashes.
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

// pg.Pool emits 'error' on IDLE clients when the connection drops (e.g. the
// Supabase pooler resetting the TCP socket). With no listener, Node treats it as
// an unhandled error event and kills the whole process — this is the ECONNRESET
// death we kept hitting. Swallow + log so a dropped idle client self-heals.
db.on("error", (err) => console.error(`db pool error (recovered): ${err.message}`));

// One retry: a single pooler reset on the first packet is common and harmless.
async function queryWatched() {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { rows } = await db.query<{ wallet: string; risk_profile: RiskProfile; label: string | null }>(
        "select wallet, risk_profile, label from public.watched_wallets where is_active order by created_at",
      );
      return rows;
    } catch (err) {
      lastErr = err;
      console.error(`watched_wallets query attempt ${attempt} failed: ${(err as Error).message.slice(0, 100)}`);
    }
  }
  throw lastErr;
}

// ── live wallet scores (60s cache regardless of polling tabs) ─────────────
export interface LivePosition extends ActiveScore {
  label: string | null;
  riskProfile: RiskProfile;
  profileStatus: ReturnType<typeof statusFor>;
}

let scoresCache: { at: number; positions: LivePosition[] } = { at: 0, positions: [] };

async function getScores(): Promise<typeof scoresCache> {
  if (Date.now() - scoresCache.at < 60_000) return scoresCache;

  let rows: { wallet: string; risk_profile: RiskProfile; label: string | null }[];
  try {
    rows = await queryWatched();
  } catch (err) {
    // DB unreachable — serve the last good cache (even if stale) rather than 500ing.
    if (scoresCache.positions.length) {
      console.error(`scores: DB unreachable, serving stale cache (${(err as Error).message.slice(0, 80)})`);
      return scoresCache;
    }
    throw err;
  }

  const positions: LivePosition[] = [];
  for (const w of rows) {
    try {
      for (const s of await adapter.scoreWallet(w.wallet)) {
        positions.push({
          ...s,
          label: w.label,
          riskProfile: w.risk_profile,
          profileStatus: statusFor(w.risk_profile, s.total),
        });
      }
    } catch (err) {
      console.error(`score failed for ${w.wallet}: ${(err as Error).message.slice(0, 100)}`);
    }
  }
  scoresCache = { at: Date.now(), positions };
  return scoresCache;
}

// ── Compass preset scenarios (ids MUST match VAULT_PRESETS in AppDemo) ────
const COMPASS_SCENARIOS: {
  id: string;
  protocol: Protocol;
  collateralSymbol: string;
  collateralValueUsd: number;
  borrowValueUsd: number;
}[] = [
  { id: "aave-usdc-supply", protocol: "aave_v3", collateralSymbol: "USDC", collateralValueUsd: 2000, borrowValueUsd: 500 },
  { id: "moonwell-usdc-supply", protocol: "moonwell", collateralSymbol: "USDC", collateralValueUsd: 1500, borrowValueUsd: 300 },
  { id: "aave-wsteth-vault", protocol: "aave_v3", collateralSymbol: "wstETH", collateralValueUsd: 8000, borrowValueUsd: 4500 },
  { id: "aave-weth-borrow", protocol: "aave_v3", collateralSymbol: "WETH", collateralValueUsd: 5000, borrowValueUsd: 2000 },
  { id: "moonwell-weth-debt", protocol: "moonwell", collateralSymbol: "WETH", collateralValueUsd: 2000, borrowValueUsd: 1300 },
  { id: "moonwell-cbeth-max", protocol: "moonwell", collateralSymbol: "cbETH", collateralValueUsd: 1500, borrowValueUsd: 1050 },
  { id: "morpho-weth-loop", protocol: "morpho", collateralSymbol: "WETH", collateralValueUsd: 4000, borrowValueUsd: 2400 },
  { id: "compound-weth-borrow", protocol: "compound_v3", collateralSymbol: "WETH", collateralValueUsd: 3000, borrowValueUsd: 1500 },
];

let compassCache: { at: number; scores: unknown[] } = { at: 0, scores: [] };

async function getCompass(): Promise<typeof compassCache> {
  if (Date.now() - compassCache.at < 60_000) return compassCache;
  const scores = await Promise.all(
    COMPASS_SCENARIOS.map(async (s) => {
      const r = await scoreProspective(s, providers);
      return {
        id: s.id,
        total: r.total,
        band: r.band,
        subScores: r.subScores,
        healthFactor: r.healthFactor,
        liquidationDrawdown: r.liquidationDrawdown,
      };
    }),
  );
  compassCache = { at: Date.now(), scores };
  return compassCache;
}

// ── wallet persona profiles (24h cache; lifetime history barely moves) ─────
// Cache-first so a returning wallet costs zero Dune credits and zero LLM calls,
// mirroring WALLET_PROFILER.md §3. In-memory here; production persists the same
// shape to watched_wallets (inferred_profile / profile_features / ai_* columns).
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const profileCache = new Map<string, { at: number; profile: WalletProfile }>();
const profileInflight = new Map<string, Promise<WalletProfile>>();

async function getProfile(wallet: string): Promise<WalletProfile> {
  const key = wallet.toLowerCase();
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;

  // De-dupe concurrent first-loads for the same wallet (Dune is slow + metered).
  const existing = profileInflight.get(key);
  if (existing) return existing;

  const job = (async () => {
    const profile = await profileWallet(key, { history: history!, narrator });
    profileCache.set(key, { at: Date.now(), profile });
    return profile;
  })().finally(() => profileInflight.delete(key));

  profileInflight.set(key, job);
  return job;
}

// ── chain telemetry (10s cache) ───────────────────────────────────────────
let chainCache: { at: number; blockNumber: number; gasGwei: number } = {
  at: 0,
  blockNumber: 0,
  gasGwei: 0,
};

async function getChain(): Promise<typeof chainCache> {
  if (Date.now() - chainCache.at < 10_000) return chainCache;
  const [block, gas] = await Promise.all([
    rawClient.getBlockNumber(),
    rawClient.getGasPrice(),
  ]);
  chainCache = { at: Date.now(), blockNumber: Number(block), gasGwei: Number(gas) / 1e9 };
  return chainCache;
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cachedAt: scoresCache.at, positions: scoresCache.positions.length });
});

// Watch registry — the UI's wallet selector source (so wallets with no
// readable positions still get a pill instead of vanishing).
app.get("/api/wallets", async (_req, res) => {
  try {
    const { rows } = await db.query(
      "select wallet, risk_profile, label from public.watched_wallets where is_active order by created_at",
    );
    res.json({ wallets: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/scores", async (_req, res) => {
  try {
    const { at, positions } = await getScores();
    res.json({ updatedAt: at, positions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/compass", async (_req, res) => {
  try {
    const { at, scores } = await getCompass();
    res.json({ updatedAt: at, scores });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/prospective", async (req, res) => {
  try {
    const protocol = String(req.query.protocol) as Protocol;
    const collateralSymbol = String(req.query.symbol);
    const collateralValueUsd = Number(req.query.collateralUsd);
    const borrowValueUsd = Number(req.query.borrowUsd);

    if (!MARKETS[protocol]?.[collateralSymbol]) {
      res.status(400).json({ error: `unknown market ${protocol}/${collateralSymbol}` });
      return;
    }
    if (!Number.isFinite(collateralValueUsd) || !Number.isFinite(borrowValueUsd) ||
        collateralValueUsd < 0 || borrowValueUsd < 0) {
      res.status(400).json({ error: "invalid amounts" });
      return;
    }

    // Providers cache for 1h, so slider drags are pure math after warmup.
    const r = await scoreProspective(
      { protocol, collateralSymbol, collateralValueUsd, borrowValueUsd },
      providers,
    );
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Predict the wallet's DeFi-persona (one of the 3 Compass types) from its
// lifetime cross-chain lending history. Returns the data AND the AI prose.
app.get("/api/profile", async (req, res) => {
  const wallet = String(req.query.wallet ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    res.status(400).json({ error: "invalid wallet address" });
    return;
  }
  if (!history) {
    res.status(503).json({ error: "profiler unconfigured (DUNE_API_KEY missing)" });
    return;
  }
  try {
    const p = await getProfile(wallet);
    res.json({
      wallet: wallet.toLowerCase(),
      profile: p.profile,
      archetype: p.archetype,
      riskAppetiteIndex: p.riskAppetiteIndex,
      confidence: p.confidence,
      tagline: p.tagline,
      description: p.description,
      reasons: p.reasons,
      features: p.features,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.get("/api/chain", async (_req, res) => {
  try {
    res.json(await getChain());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Dev safety net: never let a stray upstream rejection take the whole API down.
process.on("unhandledRejection", (reason) =>
  console.error(`unhandledRejection (kept alive): ${reason instanceof Error ? reason.message : String(reason)}`),
);

// Bind IPv4 explicitly — pairs with the Vite proxy's 127.0.0.1 target.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PANIK scoring API on http://127.0.0.1:${PORT}  (scores|compass|prospective|chain)`);
  void getScores()
    .then((c) => console.log(`warmed: ${c.positions.length} live positions`))
    .catch((e) => console.error(`scores warmup skipped: ${(e as Error).message.slice(0, 100)}`));
  void getCompass()
    .then((c) => console.log(`warmed: ${c.scores.length} compass scenarios`))
    .catch((e) => console.error(`compass warmup skipped: ${(e as Error).message.slice(0, 100)}`));
});
