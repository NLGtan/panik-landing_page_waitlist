/**
 * Lazily-built, module-scoped profiler dependencies shared by the dev Express
 * server and the Vercel serverless functions. Singletons survive warm
 * invocations so a Vercel function reuses one pg pool / provider set.
 *
 * Lives in server/ (NOT scripts/) so it ships to Vercel — the api/ functions
 * import it. scripts/ is excluded by .vercelignore.
 */

import pg from "pg";
// Import specific modules, NOT the barrel (../packages/scoring/src/index): the
// barrel re-exports the chain adapters → viem → isows → "ws", an optional dep
// esbuild can't resolve, which crashes the Vercel function at load
// (FUNCTION_INVOCATION_FAILED). The profiler needs none of that.
import { DuneHistoryProvider } from "../packages/scoring/src/providers/duneHistory";
import { OpenRouterNarrator } from "../packages/scoring/src/providers/narrator";
import type { SessionDeps } from "../packages/scoring/src/classify/profileSession";
import { SupabaseProfileCache } from "./profileCache";

let pool: pg.Pool | null = null;
let deps: SessionDeps | null = null;

/**
 * The profiler runs in short-lived contexts (serverless functions / per-request
 * Express handlers), so it wants Supabase's TRANSACTION pooler (port 6543), not
 * the SESSION pooler (5432) the long-lived Watch worker uses. Derive it from the
 * shared SUPABASE_DB_URL by swapping the port; an explicit SUPABASE_DB_POOL_URL
 * overrides. (5432 also tends to reset from some networks; 6543 is the right
 * mode here either way — Supabase's serverless recommendation.)
 */
export function transactionPoolerUrl(): string {
  const explicit = process.env.SUPABASE_DB_POOL_URL;
  if (explicit) return explicit;
  const base = process.env.SUPABASE_DB_URL as string;
  try {
    const u = new URL(base);
    if (u.port === "5432") u.port = "6543";
    return u.toString();
  } catch {
    return base;
  }
}

function getPool(): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: transactionPoolerUrl(),
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
    cache: new SupabaseProfileCache(getPool()),
    narrator: openRouterKey ? new OpenRouterNarrator(openRouterKey) : undefined,
  };
  return deps;
}

/** Validate an EVM address (the only addresses the lending spells cover). */
export function isEvmAddress(wallet: unknown): wallet is string {
  return typeof wallet === "string" && /^0x[0-9a-fA-F]{40}$/.test(wallet.trim());
}
