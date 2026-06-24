/**
 * Export all PANIK backtest data to CSV (analysis-ready), with the black-swan
 * datasets front and centre. Reads scripts/backtest/data/*.json and writes
 * scripts/backtest/datasets/*.csv. No network.
 *
 * Run:  node scripts/backtest/export-csv.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENTS } from "./events.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "data");
const OUT = resolve(HERE, "datasets");
mkdirSync(OUT, { recursive: true });

const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function writeCsv(name, headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  writeFileSync(resolve(OUT, name), lines.join("\n") + "\n");
  console.log(`${name.padEnd(34)} ${rows.length} rows`);
}
const readJson = (f) => JSON.parse(readFileSync(resolve(DATA, f), "utf8"));
const has = (f) => existsSync(resolve(DATA, f));

// ── 1. Curated: the black-swan events we backtested ───────────────────────
writeCsv(
  "black_swan_events.csv",
  ["event", "date", "chain", "protocols", "aave_liquidations", "aave_wallets", "debt_usd_millions", "asset_risk_peak", "crash_regime_fires"],
  [
    { event: "stETH / June ETH crash", date: "2022-06", chain: "ethereum", protocols: "Aave V2", aave_liquidations: 5551, aave_wallets: 1970, debt_usd_millions: 143.3, asset_risk_peak: 82, crash_regime_fires: "yes" },
    { event: "UST / LUNA collapse", date: "2022-05", chain: "ethereum", protocols: "Aave V2", aave_liquidations: 2657, aave_wallets: 1353, debt_usd_millions: 92.9, asset_risk_peak: 57, crash_regime_fires: "no" },
    { event: "FTX collapse", date: "2022-11", chain: "ethereum", protocols: "Aave V2", aave_liquidations: 334, aave_wallets: 221, debt_usd_millions: 21.0, asset_risk_peak: 65, crash_regime_fires: "partial" },
    { event: "USDC depeg (SVB)", date: "2023-03", chain: "ethereum", protocols: "Aave V2", aave_liquidations: 119, aave_wallets: 102, debt_usd_millions: 8.0, asset_risk_peak: 2, crash_regime_fires: "no" },
    { event: "Aug-2024 yen-carry crash", date: "2024-08", chain: "base", protocols: "Aave V3 / Compound III / Moonwell / Morpho", aave_liquidations: "", aave_wallets: 1544, debt_usd_millions: "", asset_risk_peak: 52, crash_regime_fires: "no" },
  ],
);

// ── 2. Curated: validation results per event/protocol ─────────────────────
writeCsv(
  "backtest_results.csv",
  ["event", "chain", "protocol", "method", "n_liquidated", "n_survivors", "baseline_recall_pct", "shipped_recall_pct", "false_alarm_pct", "precision_pct", "median_lead_hours"],
  [
    { event: "June 2022", chain: "ethereum", protocol: "Aave V2", method: "survivor-matrix", n_liquidated: 408, n_survivors: 1259, baseline_recall_pct: 49, shipped_recall_pct: 88, false_alarm_pct: 34, precision_pct: "", median_lead_hours: 44 },
    { event: "UST/LUNA 2022", chain: "ethereum", protocol: "Aave V2", method: "survivor-matrix", n_liquidated: 262, n_survivors: 1456, baseline_recall_pct: 94, shipped_recall_pct: 94, false_alarm_pct: 20, precision_pct: "", median_lead_hours: "" },
    { event: "FTX 2022", chain: "ethereum", protocol: "Aave V2", method: "survivor-matrix", n_liquidated: 34, n_survivors: 1633, baseline_recall_pct: 41, shipped_recall_pct: 53, false_alarm_pct: 27, precision_pct: "", median_lead_hours: "" },
    { event: "USDC depeg 2023", chain: "ethereum", protocol: "Aave V2", method: "survivor-matrix", n_liquidated: 29, n_survivors: 203, baseline_recall_pct: 97, shipped_recall_pct: 97, false_alarm_pct: 30, precision_pct: "", median_lead_hours: "" },
    { event: "POOLED (Ethereum)", chain: "ethereum", protocol: "Aave V2", method: "survivor-matrix", n_liquidated: 704, n_survivors: 4348, baseline_recall_pct: 65, shipped_recall_pct: 89, false_alarm_pct: 27, precision_pct: 35, median_lead_hours: "" },
    { event: "Aug-2024", chain: "base", protocol: "Aave V3", method: "survivor-matrix", n_liquidated: 1465, n_survivors: 289, baseline_recall_pct: 92, shipped_recall_pct: 92, false_alarm_pct: 24, precision_pct: 95, median_lead_hours: "" },
    { event: "Aug-2024", chain: "base", protocol: "Compound III", method: "price-walk", n_liquidated: 117, n_survivors: "", baseline_recall_pct: 100, shipped_recall_pct: 100, false_alarm_pct: "", precision_pct: "", median_lead_hours: 18 },
    { event: "Aug-2024", chain: "base", protocol: "Moonwell", method: "price-walk", n_liquidated: 564, n_survivors: "", baseline_recall_pct: 100, shipped_recall_pct: 100, false_alarm_pct: "", precision_pct: "", median_lead_hours: 33 },
    { event: "Aug-2024", chain: "base", protocol: "Morpho Blue", method: "price-walk", n_liquidated: 192, n_survivors: "", baseline_recall_pct: 100, shipped_recall_pct: 100, false_alarm_pct: "", precision_pct: "", median_lead_hours: 12 },
  ],
);

// ── 3. Per-wallet reconstructed health factors (long format) ──────────────
// One row per (wallet, sampled block). The raw evidence behind the matrices.
const HF_EVENTS = ["june", "ust", "ftx", "usdc", "aave-aug24"];
for (const evt of HF_EVENTS) {
  const file = evt === "june" ? "june-hf.json" : `${evt}-hf.json`;
  if (!has(file)) continue;
  const cfg = EVENTS[evt];
  const isoByLabel = cfg ? Object.fromEntries(cfg.blocks.map((b) => [b.label, b.iso])) : {};
  const rows = [];
  for (const u of readJson(file)) {
    for (const [label, hf] of Object.entries(u.hf || {})) {
      rows.push({
        event: evt, owner: u.owner, liquidated: u.liquidated,
        first_liq: u.firstLiqIso || "", block_label: label,
        block_time: isoByLabel[label] || "", health_factor: hf === null ? "" : hf,
      });
    }
  }
  if (rows.length) writeCsv(`positions_${evt}.csv`, ["event", "owner", "liquidated", "first_liq", "block_label", "block_time", "health_factor"], rows);
}

// ── 4. Liquidated cohorts for the price-walk protocols ────────────────────
for (const [proto, file] of [["compound", "compound-aug24-liq.json"], ["moonwell", "moonwell-aug24-liq.json"], ["morpho", "morpho-aug24-liq.json"]]) {
  if (!has(file)) continue;
  const rows = readJson(file).map((r) => ({ protocol: proto, event: "Aug-2024", owner: r.owner, first_liq: r.first_liq }));
  writeCsv(`liquidations_${proto}_aug2024.csv`, ["protocol", "event", "owner", "first_liq"], rows);
}

// ── 5. Price series ───────────────────────────────────────────────────────
if (has("weth-hourly-aug24.json")) writeCsv("prices_weth_hourly_aug2024.csv", ["hour", "weth"], readJson("weth-hourly-aug24.json"));
if (has("weth-daily-aug24.json")) writeCsv("prices_weth_wbtc_daily_aug2024.csv", ["day", "weth", "wbtc"], readJson("weth-daily-aug24.json"));

console.log(`\nDone → scripts/backtest/datasets/`);
