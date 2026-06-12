import { describe, expect, it } from "vitest";
import { scoreAssetRisk } from "../src/subscores/assetRisk";
import { scorePositionHealth } from "../src/subscores/positionHealth";
import { scoreProtocolSafety } from "../src/subscores/protocolSafety";
import { scoreSystemicRisk } from "../src/subscores/systemicRisk";
import { bandFor } from "../src/computeScore";

// ── GOLDEN VALUES from arch §Sub-Scores 3 ────────────────────────────────
describe("S_protocol_safety (static config — arch step 4)", () => {
  it("Aave V3 ≈ 10 (exact 9.75; arch's '≈11' comment is loose rounding)", () => {
    expect(scoreProtocolSafety("aave_v3")).toBeCloseTo(9.75, 2);
    expect(bandFor(scoreProtocolSafety("aave_v3"))).toBe("LOW");
  });
  it("Moonwell = 46 exactly (arch '≈46')", () => {
    expect(scoreProtocolSafety("moonwell")).toBeCloseTo(46, 2);
    expect(bandFor(scoreProtocolSafety("moonwell"))).toBe("ELEVATED");
  });
  it("Moonwell scores meaningfully riskier than Aave (the demo's credibility moment)", () => {
    expect(scoreProtocolSafety("moonwell")).toBeGreaterThan(
      scoreProtocolSafety("aave_v3") + 30,
    );
  });
});

// ── arch step 2: mock HF values 1.0 / 1.5 / 2.0+ ─────────────────────────
describe("S_position_health (HF_CEIL = 2.0)", () => {
  const ltvZero = { currentLtv: 0, maxLtv: 0.8 };

  it("HF 1.0 → HF_score 100 (liquidation boundary)", () => {
    // 0.7 × 100 + 0.3 × 0 = 70
    expect(scorePositionHealth({ healthFactor: 1.0, ...ltvZero })).toBe(70);
  });
  it("HF 1.5 → HF_score 50", () => {
    expect(scorePositionHealth({ healthFactor: 1.5, ...ltvZero })).toBe(35);
  });
  it("HF 2.0+ → HF_score 0", () => {
    expect(scorePositionHealth({ healthFactor: 2.0, ...ltvZero })).toBe(0);
    expect(scorePositionHealth({ healthFactor: 3.5, ...ltvZero })).toBe(0);
  });
  it("HF below 1.0 clamps to 100 (already liquidatable)", () => {
    expect(scorePositionHealth({ healthFactor: 0.85, ...ltvZero })).toBe(70);
  });
  it("LTV component mixes at 30%", () => {
    // HF 1.5 → 50 ⇒ 35; LTV 0.62/0.82 → 75.6 ⇒ +22.68 ⇒ 57.68
    expect(
      scorePositionHealth({ healthFactor: 1.5, currentLtv: 0.62, maxLtv: 0.82 }),
    ).toBeCloseTo(57.68, 1);
  });
  it("zero debt (null HF — the Aave uint256.max case) → 0", () => {
    expect(
      scorePositionHealth({ healthFactor: null, currentLtv: 0, maxLtv: 0.8 }),
    ).toBe(0);
  });
});

describe("S_asset_risk", () => {
  it("stablecoin profile (flat prices, no vol) → 0", () => {
    expect(
      scoreAssetRisk({
        dailyReturns30d: Array(30).fill(0),
        btcReturns30d: Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.01 : -0.01)),
        maxPrice90d: 1,
        minPrice90d: 1,
      }),
    ).toBe(0);
  });
  it("volatile, BTC-correlated, drawn-down asset scores high", () => {
    const volatile = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.06 : -0.06));
    const score = scoreAssetRisk({
      dailyReturns30d: volatile,
      btcReturns30d: volatile, // corr = 1
      maxPrice90d: 100,
      minPrice90d: 40, // 60% drawdown
    });
    // vol ≈ 116% annualised → volScore 100; dd 60; corr 100
    // 0.5×100 + 0.35×60 + 0.15×100 = 86
    expect(score).toBeCloseTo(86, 0);
  });
  it("uncorrelated asset takes no corr penalty (negative corr clamps to 0)", () => {
    const a = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.02 : -0.02));
    const b = a.map((x) => -x);
    const withPenalty = scoreAssetRisk({
      dailyReturns30d: a, btcReturns30d: a, maxPrice90d: 1, minPrice90d: 1,
    });
    const withoutPenalty = scoreAssetRisk({
      dailyReturns30d: a, btcReturns30d: b, maxPrice90d: 1, minPrice90d: 1,
    });
    expect(withPenalty - withoutPenalty).toBeCloseTo(15, 5);
  });
});

// ── arch step 5: verify near-zero on stable data ─────────────────────────
describe("S_systemic_risk", () => {
  it("stable TVL → 0", () => {
    expect(
      scoreSystemicRisk({
        sectorTvlNow: 50e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 2e9, protocolTvl7dAgo: 2e9,
      }),
    ).toBe(0);
  });
  it("growing TVL → 0 (gains are not stress)", () => {
    expect(
      scoreSystemicRisk({
        sectorTvlNow: 55e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 2.2e9, protocolTvl7dAgo: 2e9,
      }),
    ).toBe(0);
  });
  it("−20% sector drop saturates sector term → 60", () => {
    expect(
      scoreSystemicRisk({
        sectorTvlNow: 40e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 2e9, protocolTvl7dAgo: 2e9,
      }),
    ).toBe(60);
  });
  it("−15% protocol flight saturates protocol term → 40", () => {
    expect(
      scoreSystemicRisk({
        sectorTvlNow: 50e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 1.7e9, protocolTvl7dAgo: 2e9,
      }),
    ).toBe(40);
  });
  it("FTX-style event (both floors breached) → 100", () => {
    expect(
      scoreSystemicRisk({
        sectorTvlNow: 30e9, sectorTvl7dAgo: 50e9,
        protocolTvlNow: 1e9, protocolTvl7dAgo: 2e9,
      }),
    ).toBe(100);
  });
});
