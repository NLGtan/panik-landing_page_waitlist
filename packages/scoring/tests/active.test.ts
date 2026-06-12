import { describe, expect, it, vi } from "vitest";
import { ActiveAdapter } from "../src/adapters/active";
import { AaveActiveReader } from "../src/adapters/activeAave";
import { MoonwellActiveReader } from "../src/adapters/activeMoonwell";
import type { PublicClientLike } from "../src/adapters/chain";
import type { AssetRiskInput, SystemicRiskInput } from "../src/types";

const UINT256_MAX = 2n ** 256n - 1n;
const ok = (result: unknown) => ({ status: "success" as const, result });

function reserveData(aToken: string) {
  return ok({ aTokenAddress: aToken });
}

describe("AaveActiveReader", () => {
  it("maps getUserAccountData into PositionHealthInput (8-dec USD, bps LTV)", async () => {
    const multicall = vi
      .fn()
      // call 1: account data + 4 reserves
      .mockResolvedValueOnce([
        ok([
          10_000_00000000n, // $10,000 collateral (8 dec)
          4_000_00000000n, // $4,000 debt
          0n,
          8300n,
          8000n, // maxLtv 80.00%
          1_660000000000000000n, // HF 1.66
        ]),
        reserveData("0xaWETH"),
        reserveData("0xaUSDC"),
        reserveData("0xaWSTETH"),
        reserveData("0xaCBBTC"),
      ])
      // call 2: aToken balances — 2 WETH dominates 1,000 USDC
      .mockResolvedValueOnce([ok(2n * 10n ** 18n), ok(1_000n * 10n ** 6n), ok(0n), ok(0n)]);

    const client = { multicall, readContract: vi.fn() } as unknown as PublicClientLike;
    const r = await new AaveActiveReader(client).read("0xwallet");

    expect(r).not.toBeNull();
    expect(r?.positionHealth.healthFactor).toBeCloseTo(1.66, 9);
    expect(r?.positionHealth.currentLtv).toBeCloseTo(0.4, 9);
    expect(r?.positionHealth.maxLtv).toBeCloseTo(0.8, 9);
    expect(r?.collateralValueUsd).toBeCloseTo(10_000, 6);
    expect(r?.dominantCollateralSymbol).toBe("WETH");
  });

  it("maps the zero-debt sentinel to null HF (never uint256.max)", async () => {
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([
        ok([5_000_00000000n, 0n, 0n, 0n, 8000n, UINT256_MAX]),
        reserveData("0xaWETH"),
        reserveData("0xaUSDC"),
        reserveData("0xaWSTETH"),
        reserveData("0xaCBBTC"),
      ])
      .mockResolvedValueOnce([ok(0n), ok(5_000n * 10n ** 6n), ok(0n), ok(0n)]);

    const client = { multicall, readContract: vi.fn() } as unknown as PublicClientLike;
    const r = await new AaveActiveReader(client).read("0xwallet");
    expect(r?.positionHealth.healthFactor).toBeNull();
    expect(r?.dominantCollateralSymbol).toBe("USDC");
  });

  it("returns null for wallets with no position", async () => {
    const multicall = vi.fn().mockResolvedValueOnce([
      ok([0n, 0n, 0n, 0n, 0n, UINT256_MAX]),
      reserveData("0xa"),
      reserveData("0xb"),
      reserveData("0xc"),
      reserveData("0xd"),
    ]);
    const client = { multicall, readContract: vi.fn() } as unknown as PublicClientLike;
    expect(await new AaveActiveReader(client).read("0xempty")).toBeNull();
  });
});

describe("MoonwellActiveReader", () => {
  it("derives HF = Σ(collateral×CF)/borrow from entered markets", async () => {
    const readContract = vi.fn(async (args: unknown) => {
      const fn = (args as { functionName: string }).functionName;
      if (fn === "getAssetsIn") return ["0xmWETH"];
      if (fn === "oracle") return "0xoracle";
      throw new Error(`unexpected ${fn}`);
    });
    const multicall = vi
      .fn()
      // per-market batch: balance, borrow, exchangeRate, markets, price, underlying
      .mockResolvedValueOnce([
        ok(1n * 10n ** 8n), // mToken balance
        ok(1n * 10n ** 16n), // borrow 0.01 WETH raw
        ok(2n * 10n ** 26n), // exchangeRate → 0.02 WETH underlying
        ok([true, 800000000000000000n]), // CF 0.80
        ok(18n * 10n ** 20n), // price $1800 × 10^(36−18)
        ok("0xWETHunderlying"),
      ])
      // symbol lookup for dominant collateral
      .mockResolvedValueOnce([ok("WETH")]);

    const client = { multicall, readContract } as unknown as PublicClientLike;
    const r = await new MoonwellActiveReader(client).read("0xwallet");

    // collateral = 0.02 WETH × $1800 = $36; debt = 0.01 × $1800 = $18
    expect(r?.collateralValueUsd).toBeCloseTo(36, 6);
    expect(r?.borrowValueUsd).toBeCloseTo(18, 6);
    expect(r?.positionHealth.healthFactor).toBeCloseTo((36 * 0.8) / 18, 6); // 1.6
    expect(r?.positionHealth.currentLtv).toBeCloseTo(0.5, 6);
    expect(r?.positionHealth.maxLtv).toBeCloseTo(0.8, 6);
    expect(r?.dominantCollateralSymbol).toBe("WETH");
  });

  it("returns null when no markets entered", async () => {
    const readContract = vi.fn(async () => []);
    const client = {
      multicall: vi.fn(),
      readContract,
    } as unknown as PublicClientLike;
    expect(await new MoonwellActiveReader(client).read("0xempty")).toBeNull();
  });
});

describe("ActiveAdapter", () => {
  const calmAsset: AssetRiskInput = {
    dailyReturns30d: Array(30).fill(0),
    btcReturns30d: Array(30).fill(0),
    maxPrice90d: 100,
    minPrice90d: 100,
  };
  const calmSystemic: SystemicRiskInput = {
    sectorTvlNow: 1,
    sectorTvl7dAgo: 1,
    protocolTvlNow: 1,
    protocolTvl7dAgo: 1,
  };

  it("scores readings through the shared core and flags WETH proxy fallback", async () => {
    const adapter = new ActiveAdapter(
      [
        {
          read: async () => ({
            protocol: "moonwell" as const,
            positionHealth: { healthFactor: 1.05, currentLtv: 0.7, maxLtv: 0.8 },
            collateralValueUsd: 1000,
            borrowValueUsd: 700,
            dominantCollateralSymbol: "WEIRDTOKEN", // not in SYMBOL_TO_COINGECKO
          }),
        },
        { read: async () => null }, // protocol without a position is skipped
      ],
      {
        assetRisk: { getAssetRiskInput: async () => calmAsset },
        systemic: { getSystemicRiskInput: async () => calmSystemic },
      },
    );

    const scores = await adapter.scoreWallet("0xw");
    expect(scores).toHaveLength(1);
    expect(scores[0]?.band).toBe("CRITICAL"); // HF 1.05 → proximity floor
    expect(scores[0]?.assetRiskIsProxy).toBe(true);
    expect(scores[0]?.scoredCollateralSymbol).toBe("WETH (proxy)");
  });
});
