/** Minimal TTL cache used by the data providers (per-asset per-cycle caching). */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  async getOrFetch(key: string, fetcher: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await fetcher();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
}
