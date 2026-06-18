You are a data-visualization expert. Build me a single, self-contained **interactive HTML dashboard** (one `.html` file, Chart.js via CDN — no other dependencies) that visualizes the results of a DeFi risk-scoring backtest called **PANIK**. All the data you need is inlined below — use ONLY these numbers, do not invent any. Output the dashboard as an artifact.

## Context (1 paragraph for the dashboard intro)
PANIK is a non-custodial liquidation early-warning system for DeFi lending positions. We backtested its scoring engine against real historical crashes by reconstructing exact on-chain health factors (HF) for thousands of real borrowers — both liquidated and survivors — and replaying them through the engine. A position is liquidated when HF reaches ~1.0; PANIK warns "CRITICAL" earlier. We validate two things: **recall** (did it flag positions that went on to be liquidated?) and **false-alarm rate** (did it cry wolf on survivors?). The shipped change is a "crash-regime" escalation that buys extra lead time in sustained sell-offs.

## Design
- One responsive page, clean modern look, colorblind-safe palette (e.g. blue/orange/teal/gray), light theme, card per chart with a title + a one-line takeaway caption.
- Title: "PANIK — Black-Swan Backtest". Subtitle: "2 chains · 4 protocols · 6 crashes · ~7,700 real wallets".
- Every chart: titled, axes labeled with units (hours, %, USD, HF). Tooltips on.

## Charts (use exactly this data)

**1. Lead time before vs after (bar).** Median CRITICAL warning before liquidation, June-2022 ETH crash, $40M whale / healthy-start cohort. Baseline (static floor) = 17h; With crash-regime = 44h. Caption: "~2.6× more time to act."

**2. Recall vs false-alarm trade-off (line, two series vs HF threshold).** x = HF flag threshold; series = Recall% and False-alarm%.
- HF≤1.10: recall 49, false-alarm 10
- HF≤1.25: recall 89, false-alarm 23   ← mark as "SHIPPED"
- HF≤1.35: recall 93, false-alarm 33
Caption: "1.25 chosen — 1.35's +4pt recall costs +10pt false alarms."

**3. Multi-event recall, baseline vs shipped (grouped bar).** Per event, recall% baseline → shipped:
- June 2022: 49 → 88
- FTX 2022: 41 → 53
- UST/LUNA 2022: 94 → 94
- USDC depeg 2023: 97 → 97
- POOLED: 65 → 89
Caption: "Crash-regime helps ETH-led crashes, never hurts (false-alarm 27% pooled, precision 35%)."

**4. Multi-protocol on Base, Aug-2024 crash (bar, median lead time in hours).** Compound III = 18, Moonwell = 33, Morpho = 12. Add a note: "Aave V3: 92% recall / 24% false-alarm (full survivor matrix)." Caption: "All 4 protocols PANIK reads: 100% of liquidations flagged 12–33h early."

**5. Per-wallet HF trajectory — the $40M whale (line).** Reconstructed daily HF into the June-2022 crash (HF = WETH price / WETH at liquidation; anchor WETH = $1247). Plot HF over these dates; add horizontal reference lines at HF=1.25 ("crash-regime fires"), HF=1.10 ("static floor fires"), HF=1.00 ("liquidation"). Data (date: HF):
- Jun 06: 1.53
- Jun 07: 1.49
- Jun 08: 1.47
- Jun 09: 1.47
- Jun 10: 1.45
- Jun 11: 1.35
- Jun 12: 1.24
- Jun 13: 1.16
- Jun 14: 1.00  (liquidated)
Caption: "Crash-regime flags CRITICAL ~Jun 12 (HF≤1.25); the static floor waits until ~Jun 13–14 — that gap is the saved time."

**6. Survivor confusion matrix (2×2 heatmap or labeled grid).** Shipped rule, pooled Ethereum cohort. TP (liquidated, flagged) = high; FN (liquidated, missed) = low; FP (survived, flagged) = moderate; TN (survived, quiet) = high. Use these rates: Recall 89%, False-alarm 27%, Precision 35%. Render a 2×2 with the four cells labeled (Flagged/Quiet × Liquidated/Survived) shaded by value, plus the three rates beside it.

**7. Black-swan magnitudes (bar, USD liquidated on Aave).** stETH/June-2022 $143M; UST/LUNA $93M; FTX $21M; USDC depeg $8M. Caption: "The crises we backtested (Aave liquidations, ground truth)."

**8. Asset-risk vs the crash-regime gate (line/bar, S_asset_risk by event with a dashed line at 60).** Peak S_asset_risk per event: June 82, FTX 65, UST 57, USDC ~2, Aug-2024-Base 52. Dashed gate line at 60. Caption: "The crash-regime only fires above 60 — June clears it; intraday/stablecoin crashes don't (the static floor covers those)."

## Honesty rules (reflect in captions)
- Always show recall WITH false-alarm — never a bare catch rate.
- Charts 4 (Compound/Moonwell/Morpho) are recall + lead time only (price-walk), not a false-positive rate; false-positive is an engine property measured on Aave (~24–27%).
- Don't fabricate any number beyond what's given here.

Deliver the complete single-file HTML as an artifact, ready to open in a browser.
