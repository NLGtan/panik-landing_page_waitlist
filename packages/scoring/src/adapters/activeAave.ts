/**
 * Aave V3 active reader — one batched multicall per wallet.
 * HF/LTV come straight from getUserAccountData (8-dec USD base units);
 * dominant collateral is discovered via aToken balances on known reserves.
 */

import type { PositionHealthInput } from "../types";
import {
  AAVE_POOL_BASE,
  KNOWN_AAVE_RESERVES,
  type PublicClientLike,
  aavePoolAbi,
  erc20Abi,
} from "./chain";

/** Aave's no-debt sentinel: healthFactor == type(uint256).max. */
const UINT256_MAX = 2n ** 256n - 1n;

export interface ActiveReading {
  protocol: "aave_v3" | "moonwell";
  positionHealth: PositionHealthInput;
  collateralValueUsd: number;
  borrowValueUsd: number;
  /** Dominant collateral symbol, or null when discovery failed. */
  dominantCollateralSymbol: string | null;
}

export class AaveActiveReader {
  constructor(
    private readonly client: PublicClientLike,
    private readonly pool: string = AAVE_POOL_BASE,
  ) {}

  /** Returns null when the wallet has no Aave position at all. */
  async read(wallet: string): Promise<ActiveReading | null> {
    const first = await this.client.multicall({
      allowFailure: true,
      contracts: [
        {
          address: this.pool,
          abi: aavePoolAbi,
          functionName: "getUserAccountData",
          args: [wallet],
        },
        ...KNOWN_AAVE_RESERVES.map((r) => ({
          address: this.pool,
          abi: aavePoolAbi,
          functionName: "getReserveData",
          args: [r.address],
        })),
      ],
    });

    const account = first[0];
    if (!account || account.status !== "success") {
      throw new Error(`Aave getUserAccountData failed for ${wallet}`);
    }
    const [totalCollateralBase, totalDebtBase, , , ltvBps, healthFactor] =
      account.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint];

    if (totalCollateralBase === 0n && totalDebtBase === 0n) return null;

    // Zero-debt sentinel: never feed uint256.max into the formula (§3.4).
    const hf =
      totalDebtBase === 0n || healthFactor === UINT256_MAX
        ? null
        : Number(healthFactor) / 1e18;

    const collateralValueUsd = Number(totalCollateralBase) / 1e8;
    const borrowValueUsd = Number(totalDebtBase) / 1e8;

    // Collateral discovery: aToken balances on the known reserves.
    const aTokens = KNOWN_AAVE_RESERVES.map((reserve, i) => {
      const res = first[i + 1];
      if (!res || res.status !== "success") return null;
      const data = res.result as { aTokenAddress: string };
      return { reserve, aToken: data.aTokenAddress };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    let dominantCollateralSymbol: string | null = null;
    if (aTokens.length > 0) {
      const balances = await this.client.multicall({
        allowFailure: true,
        contracts: aTokens.map(({ aToken }) => ({
          address: aToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        })),
      });
      let best = 0;
      balances.forEach((b, i) => {
        if (b.status !== "success") return;
        const entry = aTokens[i];
        if (!entry) return;
        // Normalise by decimals; ranking only needs relative scale, so a
        // rough USD weight (1.0 for stables/sats handled by price later) is
        // refined in the adapter. Here: prefer the largest normalised balance
        // weighted by a crude price class (BTC≫ETH≫stable).
        const scale =
          entry.reserve.symbol === "cbBTC" ? 60_000
          : entry.reserve.symbol === "USDC" ? 1
          : 1_800;
        const usd =
          (Number(b.result as bigint) / 10 ** entry.reserve.decimals) * scale;
        if (usd > best) {
          best = usd;
          dominantCollateralSymbol = entry.reserve.symbol;
        }
      });
    }

    return {
      protocol: "aave_v3",
      positionHealth: {
        healthFactor: hf,
        currentLtv:
          collateralValueUsd > 0 ? borrowValueUsd / collateralValueUsd : 0,
        maxLtv: Number(ltvBps) / 10_000,
      },
      collateralValueUsd,
      borrowValueUsd,
      dominantCollateralSymbol,
    };
  }
}
