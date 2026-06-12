import { describe, expect, it } from "vitest";
import { annualizedVol, clamp, mean, pearsonCorr, stdDev } from "../src/math";

describe("clamp", () => {
  it("passes through in-range values", () => expect(clamp(42, 0, 100)).toBe(42));
  it("clamps below", () => expect(clamp(-5, 0, 100)).toBe(0));
  it("clamps above", () => expect(clamp(150, 0, 100)).toBe(100));
});

describe("mean / stdDev", () => {
  it("mean of known series", () => expect(mean([1, 2, 3, 4])).toBe(2.5));
  it("stdDev of known series (sample, n−1)", () => {
    // [2,4,4,4,5,5,7,9]: mean 5, sum sq dev 32, 32/7 → √4.571… ≈ 2.138
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
  });
  it("stdDev of constant series is 0", () => expect(stdDev([3, 3, 3])).toBe(0));
  it("stdDev degrades to 0 for <2 points", () => expect(stdDev([1])).toBe(0));
});

describe("pearsonCorr", () => {
  it("perfectly correlated → 1", () =>
    expect(pearsonCorr([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9));
  it("perfectly anti-correlated → −1", () =>
    expect(pearsonCorr([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 9));
  it("zero-variance series → 0 (degraded, not NaN)", () =>
    expect(pearsonCorr([1, 1, 1], [1, 2, 3])).toBe(0));
  it("length mismatch → 0 (degraded, not error)", () =>
    expect(pearsonCorr([1, 2], [1, 2, 3])).toBe(0));
});

describe("annualizedVol", () => {
  it("is stdDev × √365", () => {
    const returns = [0.01, -0.02, 0.015, 0.005, -0.01];
    expect(annualizedVol(returns)).toBeCloseTo(stdDev(returns) * Math.sqrt(365), 9);
  });
  it("zero for flat returns", () => expect(annualizedVol([0, 0, 0, 0])).toBe(0));
});
