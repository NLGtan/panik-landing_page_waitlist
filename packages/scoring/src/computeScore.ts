import { clamp } from "./math";
import { COMPOSITE_WEIGHTS, LIQUIDATION_PROXIMITY_FLOORS } from "./params";
import { scoreAssetRisk } from "./subscores/assetRisk";
import { scorePositionHealth } from "./subscores/positionHealth";
import { scoreProtocolSafety } from "./subscores/protocolSafety";
import { scoreSystemicRisk } from "./subscores/systemicRisk";
import type { Band, ScoreResult, ScoringInput, SubScores } from "./types";

/** Band mapping — arch §Bands. */
export function bandFor(score: number): Band {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "ELEVATED";
  return "LOW";
}

/**
 * Composite Panik Risk Score — arch §Composite Score.
 * Pure function: same input, same output, no I/O. Both scoring modes
 * (prospective/Compass, active/Watch) call this with adapter-built input.
 */
export function computeScore(input: ScoringInput): ScoreResult {
  const subScores: SubScores = {
    positionHealth: scorePositionHealth(input.positionHealth),
    assetRisk: scoreAssetRisk(input.assetRisk),
    protocolSafety: scoreProtocolSafety(input.protocol),
    systemicRisk: scoreSystemicRisk(input.systemicRisk),
  };

  let total = Math.round(
    clamp(
      COMPOSITE_WEIGHTS.positionHealth * subScores.positionHealth +
        COMPOSITE_WEIGHTS.assetRisk * subScores.assetRisk +
        COMPOSITE_WEIGHTS.protocolSafety * subScores.protocolSafety +
        COMPOSITE_WEIGHTS.systemicRisk * subScores.systemicRisk,
      0,
      100,
    ),
  );

  // Liquidation-proximity floor — see params.ts for the calibration evidence.
  // A position near its liquidation point is dangerous no matter how calm the
  // market inputs look (the Mar-2023 USDC depeg positions scored ~40 without this).
  const hf = input.positionHealth.healthFactor;
  if (hf !== null) {
    for (const floor of LIQUIDATION_PROXIMITY_FLOORS) {
      if (hf <= floor.hfAtOrBelow) {
        total = Math.max(total, floor.minScore);
        break;
      }
    }
  }

  return { total, band: bandFor(total), subScores };
}
