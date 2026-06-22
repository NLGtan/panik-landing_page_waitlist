/**
 * DeFi-persona classifier types. See docs/technical-docs/WALLET_PROFILER.md.
 * The classifier is pure (no I/O) and DETERMINISTIC — not ML. Adapters build a
 * WalletFeatures (Dune history) and call classifyWallet.
 */

import type { RiskProfile } from "../types";

/**
 * Lifetime cross-chain lending features for one wallet — the classifier input.
 * Produced by the Dune history provider (query 7771860). USD figures are
 * already sign-corrected (repaid/withdrawn are stored negative in the spell;
 * the query isolates by transaction_type and abs()'s repaid).
 */
export interface WalletFeatures {
  /** Total supply+borrow events — drives confidence (how much signal exists). */
  lendingTxCount: number;
  /** Distinct chains the wallet has lent on. */
  chainsActive: number;
  /** Distinct lending protocols used. */
  protocolsUsed: number;
  /** Protocol slugs (e.g. "aave", "moonwell", "sonne_finance"). */
  protocols: string[];
  /** Days between first and last lending event (tenure). */
  lendingAgeDays: number;
  /** Lifetime deposited (collateral supplied), USD. */
  depositedUsd: number;
  /** Lifetime borrowed, USD. */
  borrowedUsd: number;
  /** Lifetime repaid, USD (absolute). */
  repaidUsd: number;
  /** Lifetime withdrawn, USD (absolute) — vs deposited shows capital cycled out. */
  withdrawnUsd: number;
  /** Count of borrow events (0 ⇒ supply-only wallet). */
  borrowEvents: number;
  /** Lifetime liquidations (borrow_liquidation + deposit_liquidation txs). */
  liquidations: number;
  /** borrowed ÷ deposited — primary leverage-appetite axis. */
  borrowToDepositRatio: number;
  /** Days since the wallet's last lending action (0 = active today). */
  daysSinceLastActivity: number;
  /** Protocol the wallet uses most (by event count). */
  topProtocol: string | null;
  /** Chain the wallet lends on most (by event count). */
  topChain: string | null;
  /** Most-deposited collateral asset (by USD). */
  topCollateralSymbol: string | null;
  /** Most-borrowed asset (by USD). */
  topBorrowSymbol: string | null;
  /** Share of borrow USD in stablecoins, 0–1. High ⇒ low directional risk. */
  stableBorrowPct: number;
}

/** The onboarding-quiz (self-reported) profile, for stated-vs-revealed analysis. */
export interface StatedProfile {
  /** The 3-level bucket the Compass uses (from the quiz's riskProfile3). */
  riskProfile3: RiskProfile;
  /** 5-level display tier, e.g. "moderately_aggressive". */
  riskTier?: string;
  /** Behavioral segment, e.g. "risk_optimizer". */
  segment?: string;
  segmentLabel?: string;
  /** Raw quiz score 0–18. */
  riskScore?: number;
}

/**
 * How the on-chain (revealed) profile compares to the stated (quiz) one:
 * - aligned     — same bucket
 * - understated — on-chain is riskier than the user claimed
 * - overstated  — on-chain is tamer than the user claimed
 */
export type Alignment = "aligned" | "understated" | "overstated";

export interface ProfileClassification {
  /** The predicted Compass type — the verdict. */
  profile: RiskProfile;
  /**
   * A unique, descriptive behavioral archetype derived deterministically from
   * the features (e.g. "Leveraged stable-yield operator", "Stablecoin saver").
   * Flavor on top of the 3-type `profile`; gives each wallet a distinct label.
   */
  archetype: string;
  /** Risk-appetite index 0–100 (the continuous score behind the band). */
  riskAppetiteIndex: number;
  /** 0–1 — how much on-chain signal backed this call. Low ⇒ defaulted. */
  confidence: number;
  /** Deterministic human-readable drivers; UI fallback + narrator input. */
  reasons: string[];
  /** The feature vector the verdict was computed from (for transparency). */
  features: WalletFeatures;
}
