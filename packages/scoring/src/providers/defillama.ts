import type { SystemicRiskInput } from "../types";
import { TtlCache } from "./cache";
import type { FetchFn, SystemicRiskProvider } from "./types";

/** DefiLlama is keyless and daily-granular; 1h TTL is plenty. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

interface TvlPoint {
  date: number; // unix seconds
  tvl: number;
}

export interface DefiLlamaOptions {
  baseUrl?: string;
  ttlMs?: number;
  fetchFn?: FetchFn;
}

export class DefiLlamaProvider implements SystemicRiskProvider {
  private readonly cache: TtlCache<{ now: number; ago: number }>;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(opts: DefiLlamaOptions = {}) {
    this.cache = new TtlCache(opts.ttlMs ?? DEFAULT_TTL_MS);
    this.baseUrl = opts.baseUrl ?? "https://api.llama.fi";
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`DefiLlama ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Latest TVL and the closest point ≥7 days older. */
  private nowAndSevenDaysAgo(points: TvlPoint[]): { now: number; ago: number } {
    if (points.length === 0) throw new Error("DefiLlama: empty TVL series");
    const sorted = [...points].sort((a, b) => a.date - b.date);
    const last = sorted[sorted.length - 1] as TvlPoint;
    const cutoff = last.date - SEVEN_DAYS_S;
    let ago = sorted[0] as TvlPoint;
    for (const p of sorted) {
      if (p.date <= cutoff) ago = p;
      else break;
    }
    return { now: last.tvl, ago: ago.tvl };
  }

  /** Sector TVL — arch §Sub-Scores 4 uses total DeFi TVL as the sector proxy. */
  private sectorTvl(): Promise<{ now: number; ago: number }> {
    return this.cache.getOrFetch("sector", async () => {
      const points = await this.getJson<TvlPoint[]>("/v2/historicalChainTvl");
      return this.nowAndSevenDaysAgo(points);
    });
  }

  private protocolTvl(slug: string): Promise<{ now: number; ago: number }> {
    return this.cache.getOrFetch(`protocol:${slug}`, async () => {
      const body = await this.getJson<{
        tvl?: { date: number; totalLiquidityUSD: number }[];
      }>(`/protocol/${slug}`);
      const points = (body.tvl ?? []).map((p) => ({
        date: p.date,
        tvl: p.totalLiquidityUSD,
      }));
      return this.nowAndSevenDaysAgo(points);
    });
  }

  async getSystemicRiskInput(defillamaSlug: string): Promise<SystemicRiskInput> {
    const [sector, proto] = await Promise.all([
      this.sectorTvl(),
      this.protocolTvl(defillamaSlug),
    ]);
    return {
      sectorTvlNow: sector.now,
      sectorTvl7dAgo: sector.ago,
      protocolTvlNow: proto.now,
      protocolTvl7dAgo: proto.ago,
    };
  }
}
