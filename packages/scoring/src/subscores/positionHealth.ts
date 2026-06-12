import { clamp } from "../math";
import { HF_CEIL, POSITION_HEALTH_WEIGHTS } from "../params";
import type { PositionHealthInput } from "../types";

/**
 * S_position_health (40% of composite) — arch §Sub-Scores 1.
 *
 * HF_score interpolates between HF_CEIL (score 0) and 1.0 (score 100);
 * below 1.0 the position is liquidatable and clamps to 100.
 */
export function scorePositionHealth(input: PositionHealthInput): number {
  // No debt → no liquidation risk by definition. Adapters map Aave's
  // uint256.max sentinel (and Moonwell zero-borrow) to healthFactor: null.
  if (input.healthFactor === null) return 0;

  const hfScore = clamp(
    ((HF_CEIL - input.healthFactor) / (HF_CEIL - 1.0)) * 100,
    0,
    100,
  );

  const ltvScore =
    input.maxLtv > 0 ? clamp((input.currentLtv / input.maxLtv) * 100, 0, 100) : 0;

  return clamp(
    POSITION_HEALTH_WEIGHTS.hf * hfScore + POSITION_HEALTH_WEIGHTS.ltv * ltvScore,
    0,
    100,
  );
}
