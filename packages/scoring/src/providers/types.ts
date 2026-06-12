/**
 * Provider interfaces — SYSTEM_ARCHITECTURE §3.6 "context providers".
 * The scoring core never does I/O; providers build the market-context parts
 * of a ScoringInput. Interfaces are swappable (arch open question Q2: the
 * volatility source may change) — adapters depend on these, never on a
 * concrete vendor class.
 */

import type { AssetRiskInput, SystemicRiskInput } from "../types";

export type FetchFn = typeof fetch;

export interface AssetRiskProvider {
  /** Market-risk inputs for one asset (30d returns vs BTC, 90d extremes). */
  getAssetRiskInput(coingeckoId: string): Promise<AssetRiskInput>;
}

export interface SystemicRiskProvider {
  /** Sector + protocol TVL (now vs 7d ago) for one protocol. */
  getSystemicRiskInput(defillamaSlug: string): Promise<SystemicRiskInput>;
}
