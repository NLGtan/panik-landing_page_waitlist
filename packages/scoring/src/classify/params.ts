/**
 * Open parameters for the DeFi-persona classifier — the analogue of the
 * scoring engine's params.ts. Tune these against labeled wallets; record the
 * evidence for any change. See docs/technical-docs/WALLET_PROFILER.md §5.
 */

import type { RiskProfile } from "../types";

/** borrowToDepositRatio at/above which leverage appetite is treated as maxed. */
export const LEVERAGE_FULL = 0.8;

/** Lifetime liquidations at which the "risk realized" signal saturates. */
export const LIQ_FULL = 3;

/** (chains + protocols) at which the breadth/sophistication signal saturates. */
export const BREADTH_FULL = 12;

/**
 * Sub-signal weights for the risk-appetite index. Must sum to 1.
 * leverage dominates (primary axis); liquidations and emerging-protocol reach
 * are the strongest "aggressive" tells after it.
 */
export const APPETITE_WEIGHTS = {
  leverage: 0.35,
  emergingShare: 0.2,
  liquidations: 0.2,
  breadth: 0.15,
  hasBorrowed: 0.1,
} as const;

/** Index → Compass type. Ordered; first satisfied wins. */
export const APPETITE_BANDS: { atOrAbove: number; profile: RiskProfile }[] = [
  { atOrAbove: 67, profile: "aggressive" },
  { atOrAbove: 34, profile: "moderate" },
  { atOrAbove: 0, profile: "conservative" },
];

/** Profile returned when confidence is too low to classify (dust/empty wallet). */
export const LOW_CONFIDENCE_DEFAULT: RiskProfile = "moderate";

/** Below this confidence we fall back to LOW_CONFIDENCE_DEFAULT regardless of index. */
export const MIN_CONFIDENCE = 0.15;

/** Confidence saturates at this many lending events / days of history. */
export const CONFIDENCE_TX_FULL = 20;
export const CONFIDENCE_AGE_FULL_DAYS = 180;

/** Days without a lending action after which a wallet is treated as dormant. */
export const DORMANT_DAYS = 180;

/** Stablecoin symbols (uppercased) — for stable-vs-volatile collateral/debt reads. */
export const STABLE_SYMBOLS = new Set<string>([
  "USDC", "USDT", "USDT0", "DAI", "USDBC", "USDC.E", "USDE", "FRAX", "LUSD",
  "GHO", "CRVUSD", "USDS", "SUSD", "TUSD", "PYUSD", "USDD",
]);

/**
 * Blue-chip lending protocols. Anything in a wallet's `protocols[]` NOT listed
 * here counts as "emerging/degen" reach — a leverage-into-newer-venues signal.
 * Slugs match the Dune `lending.*` spell `project` column. Tune as coverage grows.
 */
export const BLUE_CHIP_PROTOCOLS = new Set<string>([
  "aave",
  "compound",
  "morpho",
  "moonwell",
  "spark",
  "fluid",
  "venus",
]);
