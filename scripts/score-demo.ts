/**
 * PANIK — live prospective-scoring demo (Compass end-to-end).
 * Run:  npm run demo:scores
 * Fetches REAL market data (CoinGecko + DefiLlama) and scores hypothetical
 * positions through the actual scoring engine. No chain reads needed —
 * prospective mode is pure market context + scenario math.
 */

import {
  CoinGeckoProvider,
  DefiLlamaProvider,
  scoreProspective,
  statusFor,
  type ProspectiveScenario,
} from "../packages/scoring/src/index";

const apiKey = process.env.COINGECKO_API_KEY;
if (!apiKey) {
  console.error("COINGECKO_API_KEY missing — run via: npm run demo:scores");
  process.exit(1);
}

const providers = {
  assetRisk: new CoinGeckoProvider(apiKey),
  systemic: new DefiLlamaProvider(),
};

const scenarios: (ProspectiveScenario & { label: string })[] = [
  { label: "USDC supply buffer", protocol: "aave_v3", collateralSymbol: "USDC", collateralValueUsd: 2000, borrowValueUsd: 500 },
  { label: "wstETH / USDC vault", protocol: "aave_v3", collateralSymbol: "wstETH", collateralValueUsd: 10000, borrowValueUsd: 4500 },
  { label: "WETH / USDC debt", protocol: "moonwell", collateralSymbol: "WETH", collateralValueUsd: 5000, borrowValueUsd: 3200 },
  { label: "WETH max leverage", protocol: "aave_v3", collateralSymbol: "WETH", collateralValueUsd: 5000, borrowValueUsd: 3900 },
];

console.log("\nPANIK prospective scores — LIVE market data\n" + "─".repeat(98));
console.log(
  "SCENARIO".padEnd(22) + "PROTOCOL".padEnd(10) + "HF".padStart(6) +
  "DROP→LIQ".padStart(10) + "POS".padStart(5) + "ASSET".padStart(7) +
  "PROTO".padStart(7) + "SYS".padStart(5) + "TOTAL".padStart(7) +
  "  BAND".padEnd(11) + "MODERATE PROFILE",
);
console.log("─".repeat(98));

for (const s of scenarios) {
  const r = await scoreProspective(s, providers);
  const hf = r.healthFactor === null ? "—" : r.healthFactor.toFixed(2);
  const drop =
    r.liquidationDrawdown === null ? "—" : `${(r.liquidationDrawdown * 100).toFixed(1)}%`;
  console.log(
    s.label.padEnd(22) + s.protocol.padEnd(10) + hf.padStart(6) +
    drop.padStart(10) +
    String(Math.round(r.subScores.positionHealth)).padStart(5) +
    String(Math.round(r.subScores.assetRisk)).padStart(7) +
    String(Math.round(r.subScores.protocolSafety)).padStart(7) +
    String(Math.round(r.subScores.systemicRisk)).padStart(5) +
    String(r.total).padStart(7) +
    `  ${r.band}`.padEnd(11) +
    statusFor("moderate", r.total),
  );
}

console.log("─".repeat(98));
console.log(
  "Sub-scores: POS=position health, ASSET=asset risk, PROTO=protocol safety, SYS=systemic.\n" +
  "Same engine, same data path Compass will use. Active mode (Watch) swaps the scenario\n" +
  "HF for a chain-read HF — nothing else changes.\n",
);
