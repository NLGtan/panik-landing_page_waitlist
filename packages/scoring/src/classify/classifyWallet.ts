/**
 * DeFi-persona classifier — pure, deterministic (NOT ML). Maps a wallet's
 * lifetime cross-chain lending features to one of the three Compass types.
 * Same discipline as computeScore: same input ⇒ same output, no I/O.
 * See docs/technical-docs/WALLET_PROFILER.md.
 */

import { clamp } from "../math";
import {
  APPETITE_BANDS,
  APPETITE_WEIGHTS,
  BLUE_CHIP_PROTOCOLS,
  BREADTH_FULL,
  CONFIDENCE_AGE_FULL_DAYS,
  CONFIDENCE_TX_FULL,
  DORMANT_DAYS,
  LEVERAGE_FULL,
  LIQ_FULL,
  LOW_CONFIDENCE_DEFAULT,
  MIN_CONFIDENCE,
  STABLE_SYMBOLS,
} from "./params";
import type { ProfileClassification, WalletFeatures } from "./types";

/** Protocols a wallet used that are NOT on the blue-chip allowlist. */
export function emergingProtocols(features: WalletFeatures): string[] {
  return features.protocols.filter((p) => !BLUE_CHIP_PROTOCOLS.has(p.toLowerCase()));
}

function isStable(symbol: string | null): boolean {
  return symbol !== null && STABLE_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * A unique, descriptive behavioral label derived deterministically from the
 * features — flavor on top of the conservative/moderate/aggressive verdict.
 * Built from leverage style (stable vs directional debt), supply behavior,
 * reach and recency so distinct wallets read distinctly.
 */
export function archetypeFor(f: WalletFeatures): string {
  if (f.lendingTxCount === 0) return "DeFi newcomer";

  let base: string;
  if (f.borrowEvents === 0) {
    base = isStable(f.topCollateralSymbol) ? "Stablecoin saver" : "Buy-and-hold collateral provider";
  } else if (f.stableBorrowPct >= 0.6) {
    base =
      f.borrowToDepositRatio >= LEVERAGE_FULL
        ? "Leveraged stable-yield operator"
        : "Conservative stablecoin borrower";
  } else {
    base =
      f.borrowToDepositRatio >= LEVERAGE_FULL
        ? "Directional leverage trader"
        : "Selective volatile borrower";
  }

  const tags: string[] = [];
  if (f.daysSinceLastActivity > DORMANT_DAYS) tags.push("dormant");
  if (f.chainsActive >= 5) tags.push("multichain");
  if (f.protocolsUsed > 0 && emergingProtocols(f).length / f.protocolsUsed >= 0.4) tags.push("degen-leaning");
  if (f.liquidations > 0) tags.push("battle-scarred");

  return tags.length ? `${base} (${tags.join(", ")})` : base;
}

function bandFor(index: number) {
  for (const b of APPETITE_BANDS) if (index >= b.atOrAbove) return b.profile;
  return APPETITE_BANDS[APPETITE_BANDS.length - 1].profile;
}

/** 0–1, how much on-chain signal backs the call (tx volume + tenure). */
function confidenceFor(f: WalletFeatures): number {
  const tx = clamp(f.lendingTxCount / CONFIDENCE_TX_FULL, 0, 1);
  const age = clamp(f.lendingAgeDays / CONFIDENCE_AGE_FULL_DAYS, 0, 1);
  return Math.round((0.5 * tx + 0.5 * age) * 100) / 100;
}

/**
 * Classify a wallet from its lifetime lending features.
 * Returns the verdict, the continuous appetite index, a confidence, and the
 * deterministic reasons that drove it (UI fallback + AI-narration input).
 */
export function classifyWallet(features: WalletFeatures): ProfileClassification {
  const emerging = emergingProtocols(features);

  // Normalized sub-signals, each 0–1.
  const leverage = clamp(features.borrowToDepositRatio / LEVERAGE_FULL, 0, 1);
  const emergingShare = features.protocolsUsed > 0 ? emerging.length / features.protocolsUsed : 0;
  const liq = clamp(features.liquidations / LIQ_FULL, 0, 1);
  const breadth = clamp((features.chainsActive + features.protocolsUsed) / BREADTH_FULL, 0, 1);
  const hasBorrowed = features.borrowEvents > 0 ? 1 : 0;

  const riskAppetiteIndex = Math.round(
    clamp(
      100 *
        (APPETITE_WEIGHTS.leverage * leverage +
          APPETITE_WEIGHTS.emergingShare * emergingShare +
          APPETITE_WEIGHTS.liquidations * liq +
          APPETITE_WEIGHTS.breadth * breadth +
          APPETITE_WEIGHTS.hasBorrowed * hasBorrowed),
      0,
      100,
    ),
  );

  const confidence = confidenceFor(features);
  const profile = confidence < MIN_CONFIDENCE ? LOW_CONFIDENCE_DEFAULT : bandFor(riskAppetiteIndex);

  return {
    profile,
    archetype: archetypeFor(features),
    riskAppetiteIndex,
    confidence,
    reasons: buildReasons(features, emerging),
    features,
  };
}

/** Deterministic, ordered drivers — strongest first. */
function buildReasons(f: WalletFeatures, emerging: string[]): string[] {
  const reasons: string[] = [];

  if (f.lendingTxCount === 0) {
    reasons.push("No lending history found");
    return reasons;
  }

  if (f.borrowEvents === 0) {
    reasons.push("Supply-only — never borrowed");
  } else if (f.borrowToDepositRatio >= LEVERAGE_FULL) {
    reasons.push(`High sustained leverage (${f.borrowToDepositRatio.toFixed(2)} borrow/deposit)`);
  } else if (f.borrowToDepositRatio > 0) {
    reasons.push(`Moderate leverage (${f.borrowToDepositRatio.toFixed(2)} borrow/deposit)`);
  }

  // Debt character — stablecoin debt is low directional risk; volatile debt isn't.
  if (f.borrowEvents > 0 && f.topBorrowSymbol) {
    const stablePct = Math.round(f.stableBorrowPct * 100);
    if (f.stableBorrowPct >= 0.6) {
      reasons.push(`Borrows mostly stablecoins (${stablePct}% ${f.topBorrowSymbol}-led) — low directional risk`);
    } else {
      reasons.push(`Borrows volatile assets (${f.topBorrowSymbol}-led, ${100 - stablePct}% non-stable) — directional risk`);
    }
  }

  if (f.topProtocol) {
    const where = f.topChain ? ` on ${f.topChain}` : "";
    reasons.push(`Most active on ${f.topProtocol}${where}`);
  }

  if (f.topCollateralSymbol) {
    reasons.push(`Top collateral ${f.topCollateralSymbol}`);
  }

  if (f.chainsActive > 1 || f.protocolsUsed > 1) {
    reasons.push(`Active across ${f.chainsActive} chains and ${f.protocolsUsed} protocols`);
  }

  if (emerging.length > 0) {
    reasons.push(`Used emerging protocols: ${emerging.join(", ")}`);
  }

  if (f.liquidations > 0) {
    reasons.push(`${f.liquidations} lifetime liquidation${f.liquidations === 1 ? "" : "s"}`);
  } else if (f.borrowEvents > 0) {
    reasons.push("0 lifetime liquidations");
  }

  if (f.borrowedUsd > 0) {
    const repayPct = Math.round(clamp(f.repaidUsd / f.borrowedUsd, 0, 1) * 100);
    if (repayPct >= 90) reasons.push(`~${repayPct}% of borrows repaid`);
  }

  if (f.lendingAgeDays >= 365) {
    reasons.push(`${(f.lendingAgeDays / 365).toFixed(1)}y lending tenure`);
  }

  if (f.daysSinceLastActivity > DORMANT_DAYS) {
    reasons.push(`Dormant — last active ${f.daysSinceLastActivity}d ago`);
  } else if (f.daysSinceLastActivity <= 7 && f.lendingTxCount > 0) {
    reasons.push("Active this week");
  }

  return reasons;
}
