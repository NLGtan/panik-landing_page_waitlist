import { describe, expect, it } from "vitest";
import { bandFor, computeScore } from "../src/computeScore";
import type { ScoringInput } from "../src/types";

const stableMarket = {
  sectorTvlNow: 50e9,
  sectorTvl7dAgo: 50e9,
  protocolTvlNow: 2e9,
  protocolTvl7dAgo: 2e9,
};

const stablecoinAsset = {
  dailyReturns30d: Array(30).fill(0),
  btcReturns30d: Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.01 : -0.01)),
  maxPrice90d: 1,
  minPrice90d: 1,
};

describe("bandFor (arch §Bands)", () => {
  it.each([
    [0, "LOW"], [24, "LOW"],
    [25, "ELEVATED"], [49, "ELEVATED"],
    [50, "HIGH"], [74, "HIGH"],
    [75, "CRITICAL"], [100, "CRITICAL"],
  ] as const)("score %i → %s", (score, band) => {
    expect(bandFor(score)).toBe(band);
  });
});

describe("computeScore composition (arch step 6)", () => {
  it("blue-chip scenario: healthy Aave USDC supply → LOW", () => {
    const input: ScoringInput = {
      protocol: "aave_v3",
      positionHealth: { healthFactor: 3.0, currentLtv: 0.2, maxLtv: 0.8 },
      assetRisk: stablecoinAsset,
      systemicRisk: stableMarket,
    };
    const r = computeScore(input);
    // posHealth: hf 0, ltv 25 → 7.5 ⇒ ×0.40 = 3
    // assetRisk 0; protoSafety 9.75 ⇒ ×0.20 = 1.95; systemic 0
    expect(r.total).toBe(5);
    expect(r.band).toBe("LOW");
  });

  it("distressed scenario: leveraged Moonwell ETH in a falling market → CRITICAL", () => {
    const volatile = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.06 : -0.06));
    const input: ScoringInput = {
      protocol: "moonwell",
      positionHealth: { healthFactor: 1.05, currentLtv: 0.74, maxLtv: 0.78 },
      assetRisk: {
        dailyReturns30d: volatile,
        btcReturns30d: volatile,
        maxPrice90d: 4000,
        minPrice90d: 1600,
      },
      systemicRisk: {
        sectorTvlNow: 37.5e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 1.6e9, protocolTvl7dAgo: 2e9,
      },
    };
    const r = computeScore(input);
    expect(r.band).toBe("CRITICAL");
    expect(r.subScores.positionHealth).toBeGreaterThan(90);
    expect(r.subScores.systemicRisk).toBe(100);
  });

  it("zero-debt position scores positionHealth 0 regardless of market", () => {
    const r = computeScore({
      protocol: "moonwell",
      positionHealth: { healthFactor: null, currentLtv: 0, maxLtv: 0.78 },
      assetRisk: stablecoinAsset,
      systemicRisk: stableMarket,
    });
    expect(r.subScores.positionHealth).toBe(0);
    // Only protocol safety contributes: 0.2 × 46 = 9.2 → 9
    expect(r.total).toBe(9);
    expect(r.band).toBe("LOW");
  });

  it("total is an integer and clamped to 0–100", () => {
    const r = computeScore({
      protocol: "aave_v3",
      positionHealth: { healthFactor: 0.5, currentLtv: 0.9, maxLtv: 0.8 },
      assetRisk: {
        dailyReturns30d: Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.2 : -0.2)),
        btcReturns30d: Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.2 : -0.2)),
        maxPrice90d: 100,
        minPrice90d: 1,
      },
      systemicRisk: {
        sectorTvlNow: 10e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 0.5e9, protocolTvl7dAgo: 2e9,
      },
    });
    expect(Number.isInteger(r.total)).toBe(true);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });
});
