# AI Prompt — Generate charts & graphs for the PANIK backtest

> Hand this file to an AI coding agent (or run it yourself). It generates
> publication-quality charts **from the real backtest data in this repo**. The
> backtest validates PANIK's risk-scoring engine against historical crashes; see
> `docs/technical-docs/BACKTEST_OVERVIEW.md` for the full story.

## Your task

Produce a set of charts that visualize the backtest results, a reproducible
generator that builds them from the data files, and an index doc that embeds them.

**Hard rules**
- Use **only real data** from the files/queries listed below. Never invent numbers.
  If a value isn't in the data or docs, compute it from the JSON or omit the chart.
- Title every chart; label axes **with units** (hours, %, USD, HF). Use a
  colorblind-safe palette. Add a one-line caption citing the **data source** per chart.
- Keep it reproducible: the generator reads from `scripts/backtest/data/` (and the
  result tables in the docs). After generating, verify each output file exists and is non-empty.
- Be honest in framing (mirror the docs): "recall" needs "false-alarm" beside it;
  price-walk charts show recall + lead time, **not** a false-positive rate.

## Data sources

Result tables (ground-truth numbers): `docs/technical-docs/BACKTEST_RESULTS.md`,
`docs/technical-docs/BACKTEST_OVERVIEW.md`.

Per-wallet exact-HF data (`scripts/backtest/data/`):
- `<event>-hf.json` (events: `june`, `ust`, `ftx`, `usdc`, `aave-aug24`) — array of
  `{ owner, liquidated: bool, firstLiqIso: string|null, hf: { <blockLabel>: number|null } }`.
  Block label → timestamp: Ethereum events via `events.mjs` `EVENTS[event].blocks`
  (`{label, block, iso}`); `aave-aug24` via the `BLOCKS` map in `survivor-matrix-base.ts`.
  HF `null` = no debt at that block (exclude). `liquidated` = ground-truth label.
- `{compound,moonwell,morpho}-aug24-liq.json` — `{ owner, first_liq: string }` (liquidated only).
- `weth-hourly-aug24.json` `{hour, weth}`, `weth-daily-aug24.json` `{day, weth, wbtc}`.

Engine + matrices (for recomputation if needed): `packages/scoring/src/computeScore.ts`,
`scripts/backtest/{survivor-matrix-real,survivor-matrix-usdc,survivor-matrix-base,price-walk,eth-crash-2022}.ts`.

## Reference numbers (already in the docs — use as ground truth)

- **Lead time (June, $40M whale & healthy-start median):** baseline 17h → crash-regime 44h.
- **Threshold curve (pooled, Ethereum):** HF≤1.10 → recall 49% / FA 10%; HF≤1.25 (shipped)
  → 89% / 23%; HF≤1.35 → 93% / 33%.
- **Multi-event recall baseline→shipped (full pop, exact):** June 49→88%, FTX 41→53%,
  UST 94→94%, USDC 97→97%; pooled 65→89%, false-alarm 27%, precision 35%.
- **Multi-protocol (Base, Aug-2024):** Aave V3 92% recall / 24% FA (survivor matrix);
  Compound III 100% caught / 18h lead; Moonwell 100% / 33h; Morpho 100% / 12h (price-walk).
- **Asset-risk gate (60) by event:** June 67–82 (fires), FTX 54–65 (partial), UST 46–57,
  USDC ~0, Aug-2024 Base 52 (don't fire).
- **Black-swan liquidation magnitudes (Aave, ground truth):** stETH/June $143M, UST $93M,
  FTX $21M, USDC $8M (Dune query 7731427).

## Charts to produce

1. **Lead-time before vs after** — grouped bar, baseline 17h vs crash-regime 44h. Title:
   "Crash-regime ~2.6× the warning (June 2022)". Source: `eth-crash-2022.ts`.
2. **Recall vs false-alarm trade-off** — line/scatter over HF≤{1.10,1.20,1.25,1.30,1.35};
   annotate the chosen 1.25. Source: `survivor-matrix-real.ts` gate sweep.
3. **Multi-event recall (baseline vs shipped)** — grouped bar per event + pooled. Source: RESULTS.
4. **Multi-protocol on Base** — bar of median lead time (Compound 18h / Moonwell 33h / Morpho 12h)
   with Aave V3's 92% recall noted. Source: OVERVIEW §7b.
5. **Per-position HF trajectory** — pick the $40M whale (`0x4093…`, june) and/or a few
   liquidated wallets; plot reconstructed HF over the crash window
   (`HF(t)=WETH(t)/WETH(t_liq)` from the hourly series, or the per-block HF from `<event>-hf.json`),
   with horizontal guides at HF 1.25 (crash-regime) and 1.10 (floor) and markers for
   first-CRITICAL and the liquidation time. The most intuitive "would it have saved me?" chart.
6. **Survivor confusion matrix** — 2×2 heatmap (TP/FP/FN/TN) for the shipped rule, pooled.
   Compute from the `<event>-hf.json` files (re-use `survivor-matrix-real.ts` logic).
7. **Black-swan magnitudes** — bar of USD debt liquidated per event.
8. **Asset-risk vs the 60 gate** — small-multiples/line of S_asset_risk per event over its
   window, with a dashed line at 60 (shows where the crash-regime fires vs not).

## Output & tooling

- Generator: `scripts/backtest/charts/make-charts.mjs` (Node, dependency-light). Preferred
  output: **standalone SVG** files (hand-rolled or via a tiny lib), or **Vega-Lite JSON specs**,
  or a self-contained **HTML dashboard** (Chart.js/Plotly via CDN) that reads the JSON. If Python
  is available, a matplotlib script writing PNGs is also fine.
- Write charts to `docs/technical-docs/charts/` and an index `docs/technical-docs/BACKTEST_CHARTS.md`
  that embeds each with `![](charts/…)`, a title, a one-line takeaway, and the data source.
- Keep all values traceable to a file/query/doc. Commit nothing fabricated.

When done: list the generated files, and confirm each chart's numbers match the reference table above.
