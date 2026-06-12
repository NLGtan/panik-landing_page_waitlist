/**
 * Prospective-mode helpers (Compass scenario estimates).
 * "If you open this position at X% LTV, here is your starting health factor
 * and how much the asset must move to trigger liquidation."
 */

/** HF = (collateral value × liquidation threshold) / borrow value — arch line 62. */
export function estimateHealthFactor(
  collateralValueUsd: number,
  borrowValueUsd: number,
  liquidationThreshold: number,
): number | null {
  if (borrowValueUsd <= 0) return null; // no debt → no HF (null sentinel)
  return (collateralValueUsd * liquidationThreshold) / borrowValueUsd;
}

/**
 * Fractional price drop of the collateral that brings HF to 1.0
 * (e.g. 0.28 = a 28% drop triggers liquidation). Null when no debt.
 */
export function liquidationDrawdown(
  collateralValueUsd: number,
  borrowValueUsd: number,
  liquidationThreshold: number,
): number | null {
  const hf = estimateHealthFactor(
    collateralValueUsd,
    borrowValueUsd,
    liquidationThreshold,
  );
  if (hf === null) return null;
  // HF scales linearly with collateral price: drop = 1 − 1/HF (floored at 0).
  return Math.max(0, 1 - 1 / hf);
}
