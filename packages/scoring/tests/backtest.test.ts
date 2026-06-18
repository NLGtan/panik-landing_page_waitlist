/**
 * Backtest-locked calibration — June-2022 ETH crash (stETH-depeg cascade).
 * 19 real Aave V2 WETH-collateral liquidations reconstructed per-wallet
 * (Dune queries 7731514 / 7731537 / 7731553; see BACKTEST_RESULTS.md).
 *
 * Locks the crash-regime escalation: it must lift CRITICAL lead time materially
 * for positions that started with room to act, never reduce any position's lead,
 * and stay silent both in calm markets and for healthy positions mid-crash.
 */

import { describe, expect, it } from "vitest";
import { computeScore } from "../src/computeScore";
import { runBacktest, inputAt } from "./backtest/replay";

const CALM_DAY = Date.UTC(2022, 3, 16); // Apr 16 — S_asset_risk ≈ 45
const CRASH_DAY = Date.UTC(2022, 5, 14); // Jun 14 — S_asset_risk ≈ 78

const baseline = runBacktest((i) => computeScore(i, { crashRegime: false }));
const improved = runBacktest((i) => computeScore(i));

describe("backtest — Jun-2022 ETH crash (19 real liquidations)", () => {
  it("catches every liquidated position before liquidation, both modes", () => {
    expect(baseline.caughtCritical).toBe(19);
    expect(improved.caughtCritical).toBe(19);
  });

  it("crash-regime materially raises healthy-start CRITICAL lead time", () => {
    // Positions that began healthier than the static HIGH floor (HF > 1.25):
    // these are the ones the change can actually help. Threshold reflects the
    // survivor-calibrated HF≤1.25 gate (~44h median; see BACKTEST_RESULTS).
    expect(baseline.medianLeadCriticalHealthyStartH).toBeLessThanOrEqual(24);
    expect(improved.medianLeadCriticalHealthyStartH).toBeGreaterThanOrEqual(40);
    expect(improved.medianLeadCriticalHealthyStartH).toBeGreaterThan(
      baseline.medianLeadCriticalHealthyStartH,
    );
  });

  it("never reduces any position's CRITICAL lead time (only-raises property)", () => {
    const base = new Map(baseline.results.map((r) => [r.wallet, r.leadCriticalH ?? 0]));
    for (const r of improved.results) {
      expect(r.leadCriticalH ?? 0).toBeGreaterThanOrEqual(base.get(r.wallet) as number);
    }
  });

  it("the $40M whale gets ≥40h of CRITICAL warning (was 17h)", () => {
    const whale = improved.results.find((r) =>
      r.wallet.startsWith("0x4093fbe6"),
    );
    expect(whale?.leadCriticalH ?? 0).toBeGreaterThanOrEqual(40);
  });
});

describe("crash-regime false-alarm guards", () => {
  it("does NOT escalate a healthy HF (1.6) even mid-crash — room to act remains", () => {
    expect(computeScore(inputAt(1108, CRASH_DAY, 1.6)).band).not.toBe("CRITICAL");
  });

  it("does NOT escalate a near-ish HF (1.2) in a CALM market — asset-risk gate holds", () => {
    expect(computeScore(inputAt(3000, CALM_DAY, 1.2)).band).not.toBe("CRITICAL");
  });

  it("DOES escalate a near-ish HF (1.2) once the market is crashing", () => {
    expect(computeScore(inputAt(1108, CRASH_DAY, 1.2)).band).toBe("CRITICAL");
  });
});
