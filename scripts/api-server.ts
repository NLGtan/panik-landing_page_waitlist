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
  MARKETS,
  MoonwellActiveReader,
  MorphoActiveReader,
  scoreProspective,
  statusFor,
  type ActiveScore,
  type Protocol,
  type PublicClientLike,
  type RiskProfile,
} from "../packages/scoring/src/index";

const PORT = Number(process.env.PANIK_API_PORT ?? 8787);
const cgKey = process.env.COINGECKO_API_KEY;
const alchemyKey = process.env.ALCHEMY_API_KEY_BASE_MAINNET;
const dbUrl = process.env.SUPABASE_DB_URL;
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

const db = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

// ── live wallet scores (60s cache regardless of polling tabs) ─────────────
export interface LivePosition extends ActiveScore {
  label: string | null;
  riskProfile: RiskProfile;
  profileStatus: ReturnType<typeof statusFor>;
}

let scoresCache: { at: number; positions: LivePosition[] } = { at: 0, positions: [] };

async function getScores(): Promise<typeof scoresCache> {
  if (Date.now() - scoresCache.at < 60_000) return scoresCache;

  const { rows } = await db.query<{ wallet: string; risk_profile: RiskProfile; label: string | null }>(
    "select wallet, risk_profile, label from public.watched_wallets where is_active order by created_at",
  );

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

app.get("/api/chain", async (_req, res) => {
  try {
    res.json(await getChain());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Bind IPv4 explicitly — pairs with the Vite proxy's 127.0.0.1 target.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PANIK scoring API on http://127.0.0.1:${PORT}  (scores|compass|prospective|chain)`);
  void getScores().then((c) => console.log(`warmed: ${c.positions.length} live positions`));
  void getCompass().then((c) => console.log(`warmed: ${c.scores.length} compass scenarios`));
});
