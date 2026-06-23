/**
 * Supabase ProfileCache — persistent cache for the wallet profiler, via the
 * PostgREST REST API (pure fetch, no `pg`). Uses the service key, which
 * bypasses the table's deny-all RLS. Stores the deterministic on-chain
 * classification per wallet; AI narration is regenerated per reveal.
 * Table: public.wallet_profiles (see supabase/migrations).
 *
 * Why REST, not a pg connection: these run as ESM-bundled Vercel serverless
 * functions, and `pg` (a CJS package with internal require()s) crashes when
 * bundled as ESM ("Dynamic require of 'events' is not supported"). fetch has no
 * such problem and is the idiomatic serverless + Supabase pattern.
 */

import type { ProfileCache, ProfileCacheEntry } from "../packages/scoring/src/classify/profileSession";

export class RestProfileCache implements ProfileCache {
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly serviceKey: string,
  ) {
    this.base = supabaseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
      "Content-Type": "application/json",
    };
  }

  async get(wallet: string): Promise<ProfileCacheEntry | null> {
    const url =
      `${this.base}/rest/v1/wallet_profiles` +
      `?wallet=eq.${wallet.toLowerCase()}&select=result,computed_at&limit=1`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase REST get: HTTP ${res.status}`);
    const rows = (await res.json()) as {
      result: ProfileCacheEntry["classification"];
      computed_at: string;
    }[];
    const row = rows[0];
    if (!row) return null;
    return { classification: row.result, computedAt: new Date(row.computed_at).getTime() };
  }

  async set(wallet: string, entry: ProfileCacheEntry): Promise<void> {
    // Upsert on the wallet PK (Prefer: resolution=merge-duplicates).
    const res = await fetch(`${this.base}/rest/v1/wallet_profiles`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        wallet: wallet.toLowerCase(),
        result: entry.classification,
        computed_at: new Date(entry.computedAt).toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`Supabase REST set: HTTP ${res.status}`);
  }
}
