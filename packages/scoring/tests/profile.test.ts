import { describe, expect, it } from "vitest";
import { statusFor } from "../src/profile";
import { estimateHealthFactor, liquidationDrawdown } from "../src/prospective";

describe("statusFor (arch §Risk Profiles / biz plan Watch table)", () => {
  // Conservative: fires at 25+, approaching 15–24
  it.each([
    ["conservative", 14, "within"],
    ["conservative", 15, "approaching"],
    ["conservative", 24, "approaching"],
    ["conservative", 25, "outside"],
    // Moderate: fires 50+, approaching 40–49
    ["moderate", 39, "within"],
    ["moderate", 40, "approaching"],
    ["moderate", 49, "approaching"],
    ["moderate", 50, "outside"],
    // Aggressive: fires 75+, approaching 65–74
    ["aggressive", 64, "within"],
    ["aggressive", 65, "approaching"],
    ["aggressive", 74, "approaching"],
    ["aggressive", 75, "outside"],
  ] as const)("%s @ score %i → %s", (profile, score, status) => {
    expect(statusFor(profile, score)).toBe(status);
  });
});

describe("prospective scenario estimates (Compass)", () => {
  it("HF formula matches arch line 62", () => {
    // $10k collateral, 80% liq threshold, $4k borrow → HF 2.0
    expect(estimateHealthFactor(10_000, 4_000, 0.8)).toBe(2.0);
  });
  it("no borrow → null (no HF, matches null-sentinel convention)", () => {
    expect(estimateHealthFactor(10_000, 0, 0.8)).toBeNull();
  });
  it("liquidation drawdown: HF 2.0 → 50% price drop to liquidation", () => {
    expect(liquidationDrawdown(10_000, 4_000, 0.8)).toBeCloseTo(0.5, 9);
  });
  it("already liquidatable (HF < 1) → 0% drop needed", () => {
    expect(liquidationDrawdown(10_000, 9_000, 0.8)).toBe(0);
  });
});
