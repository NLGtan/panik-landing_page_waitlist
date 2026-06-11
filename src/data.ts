/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProtocolStats, PositionState, WaitlistEntry } from "./types";

export const BASE_PROTOCOLS: ProtocolStats[] = [
  {
    name: "Aave V3",
    badge: "Blue-Chip",
    logo: "AAVE",
    tvl: "$6.42 Billion",
    auditCount: 12,
    exploitHistory: "Zero exploits over V3 lifetime. Standardized risk framework with Gauntlet integration.",
    marketShare: "54.2%",
    description: "The blue-chip standard for non-custodial liquidity. Implements advanced e-mode configurations, isolated asset lending, and high efficiency parameters across 8+ major networks."
  },
  {
    name: "Moonwell",
    badge: "Native",
    logo: "WELL",
    tvl: "$158.4 Million",
    auditCount: 4,
    exploitHistory: "No major exploits. Secondary exposure resolved via bridge fail-safes during Base network congestion.",
    marketShare: "22.8%",
    description: "The native liquidity powerhouse of the Base ecosystem. Seamlessly integrated with Coinbase web3 wallets, offering superior gas efficiency, localized liquidations, and highly customized risk models."
  }
];

export const INITIAL_POSITIONS: PositionState[] = [
  {
    protocol: "Moonwell",
    assetPair: "ETH / USDC BORROW",
    riskScore: 58,
    status: "HIGH",
    collateralValue: 1250, // USDC equivalent
    borrowValue: 850,
    healthFactor: 1.47,
    liquidationPrice: 2850,
    currentPrice: 3450,
    recommendation: "Repay $180 USDC to re-stabilize Health Factor to 1.75",
    breakdown: {
      positionHealth: 64,   // High LTV ratio (68%)
      assetVolatility: 48,  // ETH standard deviation (18-day average)
      protocolSafety: 35,   // Moonwell native tier
      systemicMarketStress: 85 // Active gas-spike and volatile swap rates
    }
  },
  {
    protocol: "Aave V3",
    assetPair: "wstETH / USDC SUPPLY & BORROW",
    riskScore: 22,
    status: "LOW",
    collateralValue: 5000,
    borrowValue: 1800,
    healthFactor: 2.78,
    liquidationPrice: 2150,
    currentPrice: 3450,
    recommendation: "Position optimal. Collateral buffer holds an 82% downside margin.",
    breakdown: {
      positionHealth: 18,   // Conservative LTV (36%)
      assetVolatility: 32,  // Staked ETH peg stability index
      protocolSafety: 12,   // Blue-chip minimal risk parameters
      systemicMarketStress: 26 // Standard baseline markets
    }
  }
];

export const INITIAL_SUBSCRIBERS: WaitlistEntry[] = [
  { email: "vitalik.eth", timestamp: "12m ago", position: 47, source: "Aave V3 Holder" },
  { email: "0x7cbf2de779cca4f169cbaf3cd49906631ad0cf7b", timestamp: "45m ago", position: 46, source: "Moonwell LP" },
  { email: "degen_whale.eth", timestamp: "2h ago", position: 45, source: "Degen Level 5" },
  { email: "0x3fc91a3afd20393f35404134be3f17117111111", timestamp: "4h ago", position: 44, source: "Institutional Yield" },
  { email: "base_builder.eth", timestamp: "5h ago", position: 43, source: "Aerodrome Pool" }
];
