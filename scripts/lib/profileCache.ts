/**
 * Supabase-backed ProfileCache — persistent cache for the wallet profiler
 * (serverless can't use in-memory). Stores the deterministic on-chain
 * classification per wallet; AI narration is regenerated per reveal.
 * Table: public.wallet_profiles (see supabase/migrations).
 */

import type pg from "pg";
import type { ProfileCache, ProfileCacheEntry } from "../../packages/scoring/src/index";

export class SupabaseProfileCache implements ProfileCache {
  constructor(private readonly pool: pg.Pool) {}

  async get(wallet: string): Promise<ProfileCacheEntry | null> {
    const { rows } = await this.pool.query<{ result: ProfileCacheEntry["classification"]; computed_at: Date }>(
      "select result, computed_at from public.wallet_profiles where wallet = $1",
      [wallet.toLowerCase()],
    );
    const row = rows[0];
    if (!row) return null;
    return { classification: row.result, computedAt: new Date(row.computed_at).getTime() };
  }

  async set(wallet: string, entry: ProfileCacheEntry): Promise<void> {
    await this.pool.query(
      `insert into public.wallet_profiles (wallet, result, computed_at)
       values ($1, $2, now())
       on conflict (wallet) do update set result = excluded.result, computed_at = now()`,
      [wallet.toLowerCase(), JSON.stringify(entry.classification)],
    );
  }
}
