/**
 * Compound V3 (Comet) active reader — Base mainnet (cUSDCv3 + cWETHv3).
 * Comet markets have ONE borrowable base asset and multiple collaterals;
 * HF is derived: Σ(collateral_i × liquidateCollateralFactor_i) / borrow.
 * cWETHv3 nuance: its price feeds are ETH-denominated, so USD display
 * values are converted via the Chainlink ETH/USD feed (HF is unaffected —
 * numerator and denominator share the denomination).
 */

import type { PositionHealthInput } from "../types";
import type { ActiveReading } from "./activeAave";
import {
  CHAINLINK_ETH_USD_BASE,
  COMETS_BASE,
  type PublicClientLike,
  chainlinkAggregatorAbi,
  cometAbi,
  erc20Abi,
} from "./chain";

interface AssetInfo {
  asset: string;
  priceFeed: string;
  scale: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
}

export class CompoundActiveReader {
  constructor(
    private readonly client: PublicClientLike,
    private readonly comets = COMETS_BASE,
  ) {}

  /** Aggregates across both Comet markets; null when the wallet uses neither. */
  async read(wallet: string): Promise<ActiveReading | null> {
    let collateralUsd = 0;
    let borrowUsd = 0;
    let weightedLiqUsd = 0; // Σ collateral × liquidateCF
    let weightedBorrowCfUsd = 0; // Σ collateral × borrowCF (maxLtv)
    let bestCollateralUsd = 0;
    let dominantAsset: string | null = null;

    const ok = <T>(r: { status: string; result?: unknown } | undefined): T | null =>
      r && r.status === "success" ? (r.result as T) : null;

    for (const comet of this.comets) {
      const head = await this.client.multicall({
        allowFailure: true,
        contracts: [
          { address: comet.address, abi: cometAbi, functionName: "numAssets" },
          { address: comet.address, abi: cometAbi, functionName: "borrowBalanceOf", args: [wallet] },
          { address: comet.address, abi: cometAbi, functionName: "baseTokenPriceFeed" },
          { address: comet.address, abi: cometAbi, functionName: "baseScale" },
          { address: CHAINLINK_ETH_USD_BASE, abi: chainlinkAggregatorAbi, functionName: "latestRoundData" },
        ],
      });
      const numAssets = ok<number>(head[0]);
      const borrowBase = ok<bigint>(head[1]);
      const baseFeed = ok<string>(head[2]);
      const baseScale = ok<bigint>(head[3]);
      const ethRound = ok<readonly [bigint, bigint, bigint, bigint, bigint]>(head[4]);
      if (numAssets === null || borrowBase === null || baseFeed === null || baseScale === null) continue;

      // ETH/USD for cWETHv3 conversion (1 when the market is USD-quoted).
      const ethUsd = comet.priceInEth && ethRound ? Number(ethRound[1]) / 1e8 : 1;

      const infoCalls = Array.from({ length: numAssets }, (_, i) => ({
        address: comet.address,
        abi: cometAbi,
        functionName: "getAssetInfo",
        args: [i],
      }));
      const infos = await this.client.multicall({ allowFailure: true, contracts: infoCalls });
      const assets = infos
        .map((r) => ok<AssetInfo>(r))
        .filter((a): a is AssetInfo => a !== null);

      const balanceAndPriceCalls = [
        { address: comet.address, abi: cometAbi, functionName: "getPrice", args: [baseFeed] },
        ...assets.flatMap((a) => [
          { address: comet.address, abi: cometAbi, functionName: "userCollateral", args: [wallet, a.asset] },
          { address: comet.address, abi: cometAbi, functionName: "getPrice", args: [a.priceFeed] },
        ]),
      ];
      const res = await this.client.multicall({ allowFailure: true, contracts: balanceAndPriceCalls });
      const basePrice = ok<bigint>(res[0]);
      if (basePrice === null) continue;

      borrowUsd += (Number(borrowBase) / Number(baseScale)) * (Number(basePrice) / 1e8) * ethUsd;

      assets.forEach((a, i) => {
        const coll = ok<readonly [bigint, bigint]>(res[1 + i * 2]);
        const price = ok<bigint>(res[2 + i * 2]);
        if (!coll || price === null || coll[0] === 0n) return;
        const usd = (Number(coll[0]) / Number(a.scale)) * (Number(price) / 1e8) * ethUsd;
        collateralUsd += usd;
        weightedLiqUsd += usd * (Number(a.liquidateCollateralFactor) / 1e18);
        weightedBorrowCfUsd += usd * (Number(a.borrowCollateralFactor) / 1e18);
        if (usd > bestCollateralUsd) {
          bestCollateralUsd = usd;
          dominantAsset = a.asset;
        }
      });
    }

    if (collateralUsd === 0 && borrowUsd === 0) return null;

    const positionHealth: PositionHealthInput = {
      healthFactor: borrowUsd > 0 ? weightedLiqUsd / borrowUsd : null,
      currentLtv: collateralUsd > 0 ? borrowUsd / collateralUsd : 0,
      maxLtv: collateralUsd > 0 ? weightedBorrowCfUsd / collateralUsd : 0,
    };

    let dominantCollateralSymbol: string | null = null;
    if (dominantAsset) {
      const sym = await this.client.multicall({
        allowFailure: true,
        contracts: [{ address: dominantAsset, abi: erc20Abi, functionName: "symbol" }],
      });
      dominantCollateralSymbol = ok<string>(sym[0]);
    }

    return {
      protocol: "compound_v3",
      positionHealth,
      collateralValueUsd: collateralUsd,
      borrowValueUsd: borrowUsd,
      dominantCollateralSymbol,
    };
  }
}
