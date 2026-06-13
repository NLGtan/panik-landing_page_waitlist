/**
 * Generates the Goldsky Mirror pipeline definition for PANIK lending events.
 * - Computes event topic0 hashes with viem (never from memory)
 * - Fetches the live Moonwell market list from the comptroller
 * - Verifies Comet + Morpho addresses on-chain before emitting config
 * - Adds raw topics/data columns to onchain.lending_events (idempotent)
 * Run:  node --env-file=.env scripts/goldsky/gen-config.mjs
 * Then: npx @goldskycom/cli pipeline apply scripts/goldsky/lending-events.yaml
 */

import { writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, toEventSelector } from "viem";
import { base } from "viem/chains";
import pg from "pg";

const rpc = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_BASE_MAINNET}`;
const client = createPublicClient({ chain: base, transport: http(rpc) });

// ── Addresses ───────────────────────────────────────────────────────────────
const AAVE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5";
const MORPHO_BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const COMET_USDC = "0xb125e6687d4313864e53df431d5425969c15eb2f";
const COMET_WETH = "0x46e6b214b524310239732d51387075e0e70970bf";
const MOONWELL_COMPTROLLER = "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c";

// Verify before emitting config — a wrong address = silent empty pipeline.
const erc20Abi = parseAbi(["function symbol() view returns (string)"]);
for (const [addr, expect] of [[COMET_USDC, "cUSDCv3"], [COMET_WETH, "cWETHv3"]]) {
  const sym = await client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" });
  if (sym !== expect) throw new Error(`${addr}: expected ${expect}, got ${sym}`);
  console.log(`verified ${expect} @ ${addr}`);
}
const morphoCode = await client.getCode({ address: MORPHO_BLUE });
if (!morphoCode || morphoCode === "0x") throw new Error("Morpho Blue: no code at address");
console.log(`verified Morpho Blue @ ${MORPHO_BLUE} (${(morphoCode.length - 2) / 2} bytes)`);

const comptrollerAbi = parseAbi(["function getAllMarkets() view returns (address[])"]);
const mTokens = (
  await client.readContract({
    address: MOONWELL_COMPTROLLER,
    abi: comptrollerAbi,
    functionName: "getAllMarkets",
  })
).map((a) => a.toLowerCase());
console.log(`fetched ${mTokens.length} Moonwell markets from comptroller`);

// ── Event signatures → topic0 (computed, exact) ────────────────────────────
const sig = (s) => toEventSelector(s);
const AAVE = {
  Supply: sig("event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)"),
  Withdraw: sig("event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)"),
  Borrow: sig("event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)"),
  Repay: sig("event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)"),
  LiquidationCall: sig("event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)"),
};
const MOONWELL = {
  Mint: sig("event Mint(address minter, uint256 mintAmount, uint256 mintTokens)"),
  Redeem: sig("event Redeem(address redeemer, uint256 redeemAmount, uint256 redeemTokens)"),
  Borrow: sig("event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)"),
  RepayBorrow: sig("event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)"),
  LiquidateBorrow: sig("event LiquidateBorrow(address liquidator, address borrower, uint256 repayAmount, address mTokenCollateral, uint256 seizeTokens)"),
};
const MORPHO = {
  Supply: sig("event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)"),
  Withdraw: sig("event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)"),
  Borrow: sig("event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)"),
  Repay: sig("event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)"),
  SupplyCollateral: sig("event SupplyCollateral(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets)"),
  WithdrawCollateral: sig("event WithdrawCollateral(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets)"),
  Liquidate: sig("event Liquidate(bytes32 indexed id, address indexed caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)"),
};
const COMET = {
  Supply: sig("event Supply(address indexed from, address indexed dst, uint256 amount)"),
  Withdraw: sig("event Withdraw(address indexed src, address indexed to, uint256 amount)"),
  SupplyCollateral: sig("event SupplyCollateral(address indexed from, address indexed dst, address indexed asset, uint256 amount)"),
  WithdrawCollateral: sig("event WithdrawCollateral(address indexed src, address indexed to, address indexed asset, uint256 amount)"),
  AbsorbDebt: sig("event AbsorbDebt(address indexed absorber, address indexed borrower, uint256 basePaidOut, uint256 usdValue)"),
  AbsorbCollateral: sig("event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)"),
};

// ── SQL helpers (Flink SQL dialect) ─────────────────────────────────────────
const topic0 = "SPLIT_INDEX(topics, ',', 0)";
const topicAddr = (i) => `CONCAT('0x', SUBSTRING(SPLIT_INDEX(topics, ',', ${i}) FROM 27 FOR 40))`;
const dataAddr = (word) => `CONCAT('0x', SUBSTRING(data FROM ${3 + word * 64 + 24} FOR 40))`;
const inList = (m) => Object.values(m).map((h) => `'${h}'`).join(", ");
const caseName = (m, renames = {}) =>
  `CASE ${topic0} ${Object.entries(m)
    .map(([n, h]) => `WHEN '${h}' THEN '${renames[n] ?? n}'`)
    .join(" ")} END`;

const NORMALIZE_MOONWELL = { Mint: "Supply", Redeem: "Withdraw", RepayBorrow: "Repay", LiquidateBorrow: "LiquidationCall" };
const NORMALIZE_MORPHO = { SupplyCollateral: "Supply", WithdrawCollateral: "Withdraw", Liquidate: "LiquidationCall" };
const NORMALIZE_COMET = { SupplyCollateral: "Supply", WithdrawCollateral: "Withdraw", AbsorbDebt: "LiquidationCall", AbsorbCollateral: "LiquidationCall" };

// TO_TIMESTAMP(FROM_UNIXTIME(...)) yields TIMESTAMP(3) — TIMESTAMP_LTZ is
// unsupported by the postgres sink (caused a crash-loop on v1 of this pipeline).
const common = `id, transaction_hash AS tx_hash, CAST(log_index AS INT) AS log_index, CAST(block_number AS BIGINT) AS block_number, TO_TIMESTAMP(FROM_UNIXTIME(block_timestamp)) AS block_time, topics, data`;

const sql = {
  t_aave: `SELECT ${common}, 'aave_v3' AS protocol,
    ${caseName(AAVE)} AS event_name,
    CASE ${topic0} WHEN '${AAVE.LiquidationCall}' THEN ${topicAddr(3)} ELSE ${topicAddr(2)} END AS user_address
    FROM aave_logs WHERE ${topic0} IN (${inList(AAVE)})`,
  t_morpho: `SELECT ${common}, 'morpho' AS protocol,
    ${caseName(MORPHO, NORMALIZE_MORPHO)} AS event_name,
    ${topicAddr(3)} AS user_address
    FROM morpho_logs WHERE ${topic0} IN (${inList(MORPHO)})`,
  t_comet_usdc: `SELECT ${common}, 'compound_v3' AS protocol,
    ${caseName(COMET, NORMALIZE_COMET)} AS event_name,
    CASE ${topic0} WHEN '${COMET.Withdraw}' THEN ${topicAddr(1)} WHEN '${COMET.WithdrawCollateral}' THEN ${topicAddr(1)} ELSE ${topicAddr(2)} END AS user_address
    FROM comet_usdc_logs WHERE ${topic0} IN (${inList(COMET)})`,
  t_comet_weth: `SELECT ${common}, 'compound_v3' AS protocol,
    ${caseName(COMET, NORMALIZE_COMET)} AS event_name,
    CASE ${topic0} WHEN '${COMET.Withdraw}' THEN ${topicAddr(1)} WHEN '${COMET.WithdrawCollateral}' THEN ${topicAddr(1)} ELSE ${topicAddr(2)} END AS user_address
    FROM comet_weth_logs WHERE ${topic0} IN (${inList(COMET)})`,
  t_moonwell: `SELECT ${common}, 'moonwell' AS protocol,
    ${caseName(MOONWELL, NORMALIZE_MOONWELL)} AS event_name,
    CASE ${topic0} WHEN '${MOONWELL.RepayBorrow}' THEN ${dataAddr(1)} WHEN '${MOONWELL.LiquidateBorrow}' THEN ${dataAddr(1)} ELSE ${dataAddr(0)} END AS user_address
    FROM moonwell_logs WHERE address IN (${mTokens.map((a) => `'${a}'`).join(", ")}) AND ${topic0} IN (${inList(MOONWELL)})`,
};

const unionSql = ["t_aave", "t_morpho", "t_comet_usdc", "t_comet_weth", "t_moonwell"]
  .map((t) => `SELECT id, protocol, event_name, user_address, tx_hash, log_index, block_number, block_time, topics, data FROM ${t}`)
  .join("\nUNION ALL\n");

// ── YAML (apiVersion 3) ──────────────────────────────────────────────────────
const source = (name, { address, topicPrefixes }) => {
  // Source filters are SQL-standard WHERE expressions (per Mirror docs).
  // topics is the comma-joined topics string, so topic0 is its prefix.
  const filters = [];
  if (address) filters.push(`address = '${address}'`);
  if (topicPrefixes) filters.push(`(${topicPrefixes.map((t) => `topics LIKE '${t}%'`).join(" OR ")})`);
  return `  ${name}:
    type: dataset
    dataset_name: base.raw_logs
    version: 1.0.0
    start_at: latest${filters.length ? `\n    filter: ${filters.join(" AND ")}` : ""}`;
};

const transform = (name, q) => `  ${name}:
    primary_key: id
    sql: |
      ${q.replace(/\n/g, "\n      ")}`;

const yaml = `name: panik-lending-events
apiVersion: 3
sources:
${source("aave_logs", { address: AAVE_POOL })}
${source("morpho_logs", { address: MORPHO_BLUE })}
${source("comet_usdc_logs", { address: COMET_USDC })}
${source("comet_weth_logs", { address: COMET_WETH })}
${source("moonwell_logs", { topicPrefixes: Object.values(MOONWELL) })}
transforms:
${transform("t_aave", sql.t_aave)}
${transform("t_morpho", sql.t_morpho)}
${transform("t_comet_usdc", sql.t_comet_usdc)}
${transform("t_comet_weth", sql.t_comet_weth)}
${transform("t_moonwell", sql.t_moonwell)}
${transform("t_lending_events", unionSql)}
sinks:
  supabase_lending_events:
    type: postgres
    from: t_lending_events
    schema: onchain
    table: lending_events
    secret_name: PANIK_SUPABASE
`;

writeFileSync("scripts/goldsky/lending-events.yaml", yaml);
console.log("\nwrote scripts/goldsky/lending-events.yaml");

// ── Prep the sink table: raw topics/data columns (idempotent) ───────────────
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("alter table onchain.lending_events add column if not exists topics text");
await db.query("alter table onchain.lending_events add column if not exists data text");
await db.end();
console.log("onchain.lending_events: topics/data columns ready");
console.log("\nNext: npx @goldskycom/cli secret create ... && pipeline apply scripts/goldsky/lending-events.yaml");
