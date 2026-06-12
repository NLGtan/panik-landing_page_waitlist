/**
 * Open parameters — arch §"Open Parameters (tune during build)".
 * The week-1 calibration spot-check tunes HF_CEIL / VOL_CEIL against
 * historical liquidations (Ethereum mainnet Aave V3 via Dune); record
 * any change here with the evidence that motivated it.
 */

/** Ceiling for health-factor score interpolation. HF >= HF_CEIL scores 0. */
export const HF_CEIL = 2.0;

/** Annualised volatility treated as full risk (1.0 = 100%). */
export const VOL_CEIL = 1.0;

/** Sector TVL 7d change at which systemic stress saturates (-20%). */
export const SECTOR_FLOOR = -0.2;

/** Protocol TVL 7d change at which capital-flight saturates (-15%). */
export const PROTO_FLOOR = -0.15;

/**
 * Liquidation-proximity floors — week-1 calibration finding (2026-06-13).
 *
 * Evidence (Dune queries 7710372 / 7710392, Aave V2 Ethereum, Mar 2023 USDC depeg):
 * 49 users were liquidated on USDC-collateral positions on 2023-03-11 when USDC
 * hit $0.9405. Two days earlier their typical state was HF ≈ 1.05 in a market
 * where USDC's 30d vol, 90d drawdown and BTC correlation were all ≈ 0 — so the
 * pure weighted composite scored them ~40 (ELEVATED): position health is capped
 * at 40 of the composite and every other term was silent. No tuning of HF_CEIL /
 * VOL_CEIL can fix this (the weight structure caps the score at ~42).
 *
 * Fix: a floor on the composite when the position is close to liquidation,
 * regardless of market calm. Plain-language: "being <10% from liquidation is
 * critical even on a sunny day." Flagged for mentor sign-off (extends arch).
 * Ordered ascending by hfAtOrBelow; first match wins.
 */
export const LIQUIDATION_PROXIMITY_FLOORS = [
  { hfAtOrBelow: 1.1, minScore: 75 }, // ≤ ~9% collateral move from liquidation → CRITICAL
  { hfAtOrBelow: 1.25, minScore: 50 }, // ≤ 20% from liquidation → HIGH
] as const;

/** Composite weights — arch §Composite Score. Must sum to 1. */
export const COMPOSITE_WEIGHTS = {
  positionHealth: 0.4,
  assetRisk: 0.25,
  protocolSafety: 0.2,
  systemicRisk: 0.15,
} as const;

/** Position-health internal mix — arch §Sub-Scores 1. */
export const POSITION_HEALTH_WEIGHTS = { hf: 0.7, ltv: 0.3 } as const;

/** Asset-risk internal mix — arch §Sub-Scores 2. */
export const ASSET_RISK_WEIGHTS = { vol: 0.5, drawdown: 0.35, corr: 0.15 } as const;

/** Systemic-risk internal mix — arch §Sub-Scores 4. */
export const SYSTEMIC_RISK_WEIGHTS = { sector: 0.6, protocolFlight: 0.4 } as const;
