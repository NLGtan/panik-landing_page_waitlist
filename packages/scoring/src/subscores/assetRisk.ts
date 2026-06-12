import { annualizedVol, clamp, pearsonCorr } from "../math";
import { ASSET_RISK_WEIGHTS, VOL_CEIL } from "../params";
import type { AssetRiskInput } from "../types";

/** S_asset_risk (25% of composite) — arch §Sub-Scores 2. */
export function scoreAssetRisk(input: AssetRiskInput): number {
  const vol30d = annualizedVol(input.dailyReturns30d);
  const drawdown90d =
    input.maxPrice90d > 0
      ? (input.maxPrice90d - input.minPrice90d) / input.maxPrice90d
      : 0;
  const corrBtc = pearsonCorr(input.dailyReturns30d, input.btcReturns30d);

  const volScore = clamp((vol30d / VOL_CEIL) * 100, 0, 100);
  const drawdownScore = clamp(drawdown90d * 100, 0, 100);
  const corrPenalty = clamp(corrBtc, 0, 1) * 100;

  return clamp(
    ASSET_RISK_WEIGHTS.vol * volScore +
      ASSET_RISK_WEIGHTS.drawdown * drawdownScore +
      ASSET_RISK_WEIGHTS.corr * corrPenalty,
    0,
    100,
  );
}
