/**
 * Week-1 calibration spot-check — biz plan Risk 1, SYSTEM_ARCHITECTURE §3.6.
 * Vectors are real market data around the Mar-2023 USDC depeg (Dune queries
 * 7710372 / 7710392). Pass criterion: positions that were actually liquidated
 * must score HIGH/CRITICAL *before* the event; safe positions in the same
 * market must not.
 */

import { describe, expect, it } from "vitest";
import { computeScore } from "../src/computeScore";
import { COMPOSITE_WEIGHTS } from "../src/params";
import { scoreAssetRisk } from "../src/subscores/assetRisk";
import type { ScoringInput, SystemicRiskInput } from "../src/types";
import { IDX_MAR9, USDC, WBTC, WETH, assetRiskAt } from "./fixtures/depeg2023";

/** Pre-depeg the market was calm — sector/protocol TVL flat. */
const calmSystemic: SystemicRiskInput = {
  sectorTvlNow: 100e9,
  sectorTvl7dAgo: 100e9,
  protocolTvlNow: 5e9,
  protocolTvl7dAgo: 5e9,
};

function weightedComposite(r: ReturnType<typeof computeScore>): number {
  return (
    COMPOSITE_WEIGHTS.positionHealth * r.subScores.positionHealth +
    COMPOSITE_WEIGHTS.assetRisk * r.subScores.assetRisk +
    COMPOSITE_WEIGHTS.protocolSafety * r.subScores.protocolSafety +
    COMPOSITE_WEIGHTS.systemicRisk * r.subScores.systemicRisk
  );
}

describe("calibration — Mar 2023 USDC depeg (49 real liquidations on Mar 11)", () => {
  it("USDC asset risk was effectively silent before the depeg", () => {
    // This is the formula's documented blind spot: stablecoin tail risk is
    // invisible to vol/drawdown/correlation until it happens.
    const s = scoreAssetRisk(assetRiskAt(USDC, WBTC, IDX_MAR9));
    expect(s).toBeLessThan(6);
  });

  it("depeg victim (USDC collateral, HF 1.05 on Mar 9) → CRITICAL via proximity floor", () => {
    const input: ScoringInput = {
      protocol: "aave_v3",
      positionHealth: { healthFactor: 1.05, currentLtv: 0.82, maxLtv: 0.875 },
      assetRisk: assetRiskAt(USDC, WBTC, IDX_MAR9),
      systemicRisk: calmSystemic,
    };
    const r = computeScore(input);
    expect(r.band).toBe("CRITICAL");
    expect(r.total).toBeGreaterThanOrEqual(75);
    // The calibration gap the floor closes: the pure weighted composite would
    // have scored this position ELEVATED (<50) two days before liquidation.
    expect(weightedComposite(r)).toBeLessThan(50);
  });

  it("WETH borrower at HF 1.07 on Mar 9 (liquidated in the Mar 10 ETH leg) → CRITICAL", () => {
    const input: ScoringInput = {
      protocol: "aave_v3",
      positionHealth: { healthFactor: 1.07, currentLtv: 0.78, maxLtv: 0.825 },
      assetRisk: assetRiskAt(WETH, WBTC, IDX_MAR9),
      systemicRisk: calmSystemic,
    };
    expect(computeScore(input).band).toBe("CRITICAL");
  });

  it("same market, same day, WETH at a safe HF 1.6 → below alert threshold (<50)", () => {
    const input: ScoringInput = {
      protocol: "aave_v3",
      positionHealth: { healthFactor: 1.6, currentLtv: 0.5, maxLtv: 0.825 },
      assetRisk: assetRiskAt(WETH, WBTC, IDX_MAR9),
      systemicRisk: calmSystemic,
    };
    const r = computeScore(input);
    expect(r.total).toBeLessThan(50);
    expect(["LOW", "ELEVATED"]).toContain(r.band);
  });

  it("WETH volatility/correlation read sensibly off the real series", () => {
    const s = scoreAssetRisk(assetRiskAt(WETH, WBTC, IDX_MAR9));
    expect(s).toBeGreaterThan(25); // a volatile asset is not LOW…
    expect(s).toBeLessThan(75); // …but pre-event it wasn't saturated either
  });
});

describe("liquidation-proximity floors (unit)", () => {
  const silentMarket = {
    assetRisk: assetRiskAt(USDC, WBTC, IDX_MAR9),
    systemicRisk: calmSystemic,
  };

  it.each([
    [1.09, 75],
    [1.24, 50],
  ])("HF %f floors the score at %i", (hf, min) => {
    const r = computeScore({
      protocol: "aave_v3",
      positionHealth: { healthFactor: hf, currentLtv: 0.7, maxLtv: 0.875 },
      ...silentMarket,
    });
    expect(r.total).toBeGreaterThanOrEqual(min);
  });

  it("HF just above the floor band (1.26) is not floored", () => {
    const r = computeScore({
      protocol: "aave_v3",
      positionHealth: { healthFactor: 1.26, currentLtv: 0.7, maxLtv: 0.875 },
      ...silentMarket,
    });
    expect(r.total).toBeLessThan(50);
  });

  it("no-debt positions (HF null) are never floored", () => {
    const r = computeScore({
      protocol: "aave_v3",
      positionHealth: { healthFactor: null, currentLtv: 0, maxLtv: 0.875 },
      ...silentMarket,
    });
    expect(r.band).toBe("LOW");
  });
});
