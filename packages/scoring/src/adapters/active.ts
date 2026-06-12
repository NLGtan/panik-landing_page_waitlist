/**
 * ActiveAdapter — Watch-mode scoring (SYSTEM_ARCHITECTURE §3.6).
 * Chain readers supply position health; the SAME providers and scoring core
 * as prospective mode supply everything else. Mode = adapter swap, no fork.
 */

import { computeScore } from "../computeScore";
import { PROTOCOL_DEFILLAMA_SLUG, SYMBOL_TO_COINGECKO } from "../markets";
import type { AssetRiskProvider, SystemicRiskProvider } from "../providers/types";
import type { Protocol, ScoreResult, ScoringInput } from "../types";
import type { ActiveReading } from "./activeAave";

export interface ActiveReader {
  read(wallet: string): Promise<ActiveReading | null>;
}

export interface ActiveScore extends ScoreResult {
  protocol: Protocol;
  wallet: string;
  healthFactor: number | null;
  collateralValueUsd: number;
  borrowValueUsd: number;
  /** Asset whose market risk was scored (dominant collateral). */
  scoredCollateralSymbol: string;
  /** True when collateral discovery failed and WETH was used as proxy. */
  assetRiskIsProxy: boolean;
}

export class ActiveAdapter {
  constructor(
    private readonly readers: ActiveReader[],
    private readonly providers: {
      assetRisk: AssetRiskProvider;
      systemic: SystemicRiskProvider;
    },
  ) {}

  /** Scores every position the wallet holds across registered protocols. */
  async scoreWallet(wallet: string): Promise<ActiveScore[]> {
    const readings = await Promise.all(this.readers.map((r) => r.read(wallet)));
    const scores: ActiveScore[] = [];

    for (const reading of readings) {
      if (!reading) continue;

      const symbol = reading.dominantCollateralSymbol;
      const coingeckoId = symbol ? SYMBOL_TO_COINGECKO[symbol] : undefined;
      const assetRiskIsProxy = !coingeckoId;

      const [assetRisk, systemicRisk] = await Promise.all([
        this.providers.assetRisk.getAssetRiskInput(coingeckoId ?? "ethereum"),
        this.providers.systemic.getSystemicRiskInput(
          PROTOCOL_DEFILLAMA_SLUG[reading.protocol],
        ),
      ]);

      const input: ScoringInput = {
        protocol: reading.protocol,
        positionHealth: reading.positionHealth,
        assetRisk,
        systemicRisk,
      };

      scores.push({
        ...computeScore(input),
        protocol: reading.protocol,
        wallet,
        healthFactor: reading.positionHealth.healthFactor,
        collateralValueUsd: reading.collateralValueUsd,
        borrowValueUsd: reading.borrowValueUsd,
        scoredCollateralSymbol: assetRiskIsProxy ? "WETH (proxy)" : (symbol as string),
        assetRiskIsProxy,
      });
    }
    return scores;
  }
}
