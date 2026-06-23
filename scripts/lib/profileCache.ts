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

  // The Supabase pooler frequently resets the first packet on a cold connect
  // (same reason api-server's queryWatched retries once). One retry turns that
  // harmless reset into a non-event instead of a 502.
  private async query<T extends pg.QueryResultRow>(text: string, params: unknown[]): Promise<T[]> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { rows } = await this.pool.query<T>(text, params);
        return rows;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async get(wallet: string): Promise<ProfileCacheEntry | null> {
    const rows = await this.query<{ result: ProfileCacheEntry["classification"]; computed_at: Date }>(
      "select result, computed_at from public.wallet_profiles where wallet = $1",
      [wallet.toLowerCase()],
    );
    const row = rows[0];
    if (!row) return null;
    return { classification: row.result, computedAt: new Date(row.computed_at).getTime() };
  }

  async set(wallet: string, entry: ProfileCacheEntry): Promise<void> {
    await this.query(
      `insert into public.wallet_profiles (wallet, result, computed_at)
       values ($1, $2, now())
       on conflict (wallet) do update set result = excluded.result, computed_at = now()`,
      [wallet.toLowerCase(), JSON.stringify(entry.classification)],
    );
  }
}
