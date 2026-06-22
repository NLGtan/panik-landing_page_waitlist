import { describe, expect, it } from "vitest";
import { classifyWallet, emergingProtocols } from "../src/classify/classifyWallet";
import { fallbackNarration } from "../src/providers/narrator";
import type { WalletFeatures } from "../src/classify/types";

/** Real wallet 0xaa40…57e9 — pulled live from Dune query 7771860. */
const AGGRESSIVE: WalletFeatures = {
  lendingTxCount: 13854,
  chainsActive: 10,
  protocolsUsed: 6,
  protocols: ["sonne_finance", "compound", "moonwell", "morpho", "aave", "benqi"],
  lendingAgeDays: 1552,
  daysSinceLastActivity: 0,
  depositedUsd: 102_190_253,
  withdrawnUsd: 105_441_127,
  borrowedUsd: 88_551_790,
  repaidUsd: 87_809_786,
  borrowEvents: 2897,
  liquidations: 0,
  borrowToDepositRatio: 0.867,
  topProtocol: "aave",
  topChain: "avalanche_c",
  topCollateralSymbol: "USDC",
  topBorrowSymbol: "USDt",
  stableBorrowPct: 0.777,
};

/** Real wallet 0x9452…6c57 — pulled live from the same query. */
const MODERATE: WalletFeatures = {
  lendingTxCount: 1813,
  chainsActive: 9,
  protocolsUsed: 4,
  protocols: ["zerolend", "moonwell", "compound", "aave"],
  lendingAgeDays: 420,
  daysSinceLastActivity: 1,
  depositedUsd: 18_865_617,
  withdrawnUsd: 18_000_000,
  borrowedUsd: 7_822_442,
  repaidUsd: 7_578_644,
  borrowEvents: 366,
  liquidations: 0,
  borrowToDepositRatio: 0.415,
  topProtocol: "aave",
  topChain: "base",
  topCollateralSymbol: "WETH",
  topBorrowSymbol: "USDC",
  stableBorrowPct: 0.82,
};

const SUPPLY_ONLY: WalletFeatures = {
  lendingTxCount: 40,
  chainsActive: 1,
  protocolsUsed: 1,
  protocols: ["aave"],
  lendingAgeDays: 300,
  daysSinceLastActivity: 5,
  depositedUsd: 50_000,
  withdrawnUsd: 10_000,
  borrowedUsd: 0,
  repaidUsd: 0,
  borrowEvents: 0,
  liquidations: 0,
  borrowToDepositRatio: 0,
  topProtocol: "aave",
  topChain: "ethereum",
  topCollateralSymbol: "USDC",
  topBorrowSymbol: null,
  stableBorrowPct: 0,
};

const EMPTY: WalletFeatures = {
  lendingTxCount: 0,
  chainsActive: 0,
  protocolsUsed: 0,
  protocols: [],
  lendingAgeDays: 0,
  daysSinceLastActivity: 0,
  depositedUsd: 0,
  withdrawnUsd: 0,
  borrowedUsd: 0,
  repaidUsd: 0,
  borrowEvents: 0,
  liquidations: 0,
  borrowToDepositRatio: 0,
  topProtocol: null,
  topChain: null,
  topCollateralSymbol: null,
  topBorrowSymbol: null,
  stableBorrowPct: 0,
};

describe("classifyWallet (golden fixtures from real Dune data)", () => {
  it("high-leverage multi-protocol whale → aggressive (leveraged stable-yield)", () => {
    const r = classifyWallet(AGGRESSIVE);
    expect(r.profile).toBe("aggressive");
    expect(r.riskAppetiteIndex).toBeGreaterThanOrEqual(67);
    expect(r.confidence).toBeGreaterThan(0.9);
    // 77.7% stablecoin debt + high leverage + 5 chains + emerging protocols.
    expect(r.archetype).toContain("Leveraged stable-yield operator");
    expect(r.archetype).toContain("multichain");
  });

  it("buffered borrower → moderate", () => {
    const r = classifyWallet(MODERATE);
    expect(r.profile).toBe("moderate");
    expect(r.riskAppetiteIndex).toBeGreaterThanOrEqual(34);
    expect(r.riskAppetiteIndex).toBeLessThan(67);
  });

  it("supply-only stablecoin holder → conservative, archetype = Stablecoin saver", () => {
    const r = classifyWallet(SUPPLY_ONLY);
    expect(r.profile).toBe("conservative");
    expect(r.reasons).toContain("Supply-only — never borrowed");
    expect(r.archetype).toBe("Stablecoin saver");
  });

  it("empty wallet → low confidence → default moderate, never throws", () => {
    const r = classifyWallet(EMPTY);
    expect(r.confidence).toBeLessThan(0.15);
    expect(r.profile).toBe("moderate");
    expect(r.archetype).toBe("DeFi newcomer");
    expect(r.reasons).toContain("No lending history found");
  });

  it("detects emerging (non-blue-chip) protocols", () => {
    expect(emergingProtocols(AGGRESSIVE).sort()).toEqual(["benqi", "sonne_finance"]);
    expect(emergingProtocols(MODERATE)).toEqual(["zerolend"]);
  });
});

describe("fallbackNarration (deterministic, no LLM)", () => {
  it("flags discipline for a 0-liquidation borrower", () => {
    const n = fallbackNarration(classifyWallet(AGGRESSIVE));
    expect(n.tagline).toMatch(/^Aggressive —/);
    expect(n.tagline.toLowerCase()).toContain("disciplined");
  });
});
