/**
 * Lazily-built, module-scoped profiler dependencies shared by the dev Express
 * server and the Vercel serverless functions. Singletons survive warm
 * invocations so a Vercel function reuses one pg pool / provider set.
 */

import pg from "pg";
import { DuneHistoryProvider, OpenRouterNarrator, type SessionDeps } from "../../packages/scoring/src/index";
import { SupabaseProfileCache } from "./profileCache";

let pool: pg.Pool | null = null;
let deps: SessionDeps | null = null;

function getPool(dbUrl: string): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  pool.on("error", (err) => console.error(`profile pg pool error (recovered): ${err.message}`));
  return pool;
}

/**
 * Build (once) the SessionDeps from env. Throws if DUNE_API_KEY or the DB URL
 * is missing — the caller maps that to a 503. OPENROUTER_API_KEY is optional
 * (deterministic fallback prose is used without it).
 */
export function getProfileDeps(): SessionDeps {
  if (deps) return deps;

  const duneKey = process.env.DUNE_API_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!duneKey) throw new Error("DUNE_API_KEY missing");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL missing");

  deps = {
    history: new DuneHistoryProvider(duneKey),
    cache: new SupabaseProfileCache(getPool(dbUrl)),
    narrator: openRouterKey ? new OpenRouterNarrator(openRouterKey) : undefined,
  };
  return deps;
}

/** Validate an EVM address (the only addresses the lending spells cover). */
export function isEvmAddress(wallet: unknown): wallet is string {
  return typeof wallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(wallet.trim());
}
