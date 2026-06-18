# PANIK — Black-Swan Backtest & Accuracy Methodology (v0.1, draft)

> **Origin.** Team-lead requirement (2026-06-16): show, for real historical crises,
> *"if PANIK had existed then, would it have saved my position?"* — and back it with a
> **measured accuracy** number, because this is shown to users and money is involved.
>
> **Relationship to architecture.** This is a deliberate scope-up of §3.6's "timeboxed
> week-1 calibration spot-check" ([SYSTEM_ARCHITECTURE.md §3.6](./SYSTEM_ARCHITECTURE.md)).
> The doc reconciled mentor ("no historical validation required") vs biz ("stress-test
> USDC depeg/FTX/May-2021") as a calibration exercise, **explicitly not** a validation
> gate. The team lead is now asking for the validation gate + a public-facing metric.
> That is fine — but it must be agreed knowingly, and held to a higher bar of rigor.

---

## 0. The one rule that matters: an honest backtest can hurt us

For a money product, a *misleading* accuracy number is worse than none — it is a
reputational and arguably regulatory liability. The four ways a crypto backtest lies, and
how we forbid each:

| Bias | The trap | Rule we enforce |
| --- | --- | --- |
| **Look-ahead** | Scoring time *T* using data only knowable after *T* (e.g. "30d vol" that peeks past the crash). | At each step, the engine sees **only data with timestamp ≤ T**. Reconstruct point-in-time inputs. |
| **Survivorship / selection** | Only replaying positions that *got liquidated* → a detector that screams "Critical" at everything scores 100%. | Every event includes a **control set of positions that survived**. Without it, there is no false-positive rate, and the number is meaningless. |
| **Oracle mismatch** | Scoring against CoinGecko spot when Aave liquidates on its **Chainlink** oracle price. | Score against the **same Chainlink historical price the protocol used** (Decision #5). Spot price is a different number and gives wrong HFs. |
| **Cherry-picking** | One heroic example becomes the headline. | Report **per-event, with sample sizes and the false-positive rate shown next to the catch rate.** No single blended hero-number. |

**The honest claim we can defend** looks like:
> *"Across N reconstructed positions in M historical crises, PANIK would have raised
> **Critical** a median of **H hours** before liquidation, at a false-alarm rate of **F%**."*

**Not** "PANIK is 99% accurate."

---

## 1. The events (lending-liquidation relevant, dated)

Selected for *relevance to a leveraged lending position*, not just "crypto went down."
Chain note: **Base did not exist** until Aug 2023, so every pre-2023 event is reconstructed
on **Ethereum mainnet** (Aave V2). Aave **V3 on Ethereum launched Jan 2023**, so only the
USDC depeg is a V3 story.

| # | Event | Date | Protocol / venue | Why it liquidates a borrower | Reconstruction difficulty |
| --- | --- | --- | --- | --- | --- |
| 1 | **stETH depeg** | Jun 2022 | Aave **V2** | The classic stETH↔ETH leverage loop; stETH/ETH gap → HF collapse. **Cleanest, most on-topic story.** | Medium |
| 2 | **UST / LUNA** | May 9–13 2022 | Aave V2 | UST-collateral loans + market-wide crash. | Medium–High (oldest) |
| 3 | **FTX / FTT** | Nov 8–11 2022 | Aave V2 | Broad crash + SOL/FTT collateral collapse. | Medium |
| 4 | **USDC depeg (SVB)** | Mar 10–11 2023 | Aave **V3** | USDC to $0.87; stable-collateral / stable-LP loops; Aave froze markets. | Low (V3, recent) |
| 5 | *(optional)* **wstETH oracle glitch** | Mar 10 2026 | Aave V3 | $27M liquidated on a transient oracle discrepancy. | Low — **but see caveat** |
| — | *(context only)* Black Thursday | Mar 12 2020 | Maker/Compound | Aave V1 was days old/tiny; not our protocol. Cite, don't backtest. | N/A |

> **Caveat on #5 (oracle glitch):** this is an *oracle* failure, not a market move. PANIK
> scores against the same oracle the liquidator uses, so it would likely **not** "save" you
> from an oracle glitch — and that is the honest answer. Useful as a *limitations* example,
> dangerous as a hero example.

**Recommended v0 order:** start with **USDC depeg (V3, recent, easiest data)** to prove the
pipeline end-to-end, then **stETH depeg (V2)** as the strongest narrative, then fan out.

---

## 2. Ground truth & data sources (all confirmed available)

- **Liquidations (the label):** `aave_ethereum.lendingpool_evt_liquidationcall` (V2),
  `aave_v3_ethereum.pool_evt_liquidationcall` (V3) — Dune, confirmed.
- **Position reconstruction:** `..._evt_borrow` / `_evt_deposit` / `_evt_repay` /
  `_evt_redeemunderlying` (V2) replayed per-user to rebuild collateral & debt over time.
- **Oracle price (what HF is computed against):** Chainlink historical round data
  (on-chain via archive RPC) or Dune Chainlink/price spells. **Must** match the asset the
  protocol priced against.
- **Asset-risk inputs (vol_30d, drawdown_90d, corr_btc):** historical *daily* prices as of
  date *T* (CoinGecko historical endpoint or Dune `prices.usd`), windowed strictly ≤ T.
- **Systemic input (TVL):** DefiLlama historical TVL as of *T*.
- **Scoring engine:** existing pure-TS `computeScore(ScoringInput) → ScoreResult`
  ([packages/scoring/](../../packages/scoring/)) — no chain imports, so the backtest is
  pure offline replay. This is exactly what the "pure core + adapters" decision bought us.

---

## 3. Method

For each event *e* and each sampled position *p* (both liquidated and survivor controls):

1. **Reconstruct** *p*'s collateral/debt timeline from on-chain events, sampled hourly over
   a window `[event_start − 7d, event_end]`.
2. At each timestep *T*, assemble a **point-in-time `ScoringInput`** (HF from Chainlink
   oracle price at *T*; asset-risk from the ≤T price window; TVL at *T*).
3. Run `computeScore` → record band (Safe/Warning/High/Critical) at *T*.
4. **Label** *p*: `liquidated` iff a `LiquidationCall` hit it within the event window; else
   `survivor`.
5. **Detection:** *p* is "flagged" iff PANIK reached **Critical** at some `T_flag`.
6. **Lead time:** `T_liquidation − T_flag` (only meaningful for liquidated positions).

### Confusion matrix (per event, then pooled with sample sizes)

| | Liquidated (actual) | Survived (actual) |
| --- | --- | --- |
| **Flagged Critical** | TP | FP (false alarm) |
| **Never flagged** | FN (dangerous miss) | TN |

Headline metrics, reported **with N and per-event**:
- **Recall / catch rate** = TP / (TP+FN) — did we catch the ones that blew up?
- **Lead time** = median & p25 hours of warning before liquidation (the "could you act?" number).
- **False-alarm rate** = FP / (FP+TN) — how often we'd cry wolf on a healthy position.
- **Precision** = TP / (TP+FP) — when we scream, how often does it matter.

A "saved" position = **TP with lead time ≥ threshold** (propose **≥6h** default; PANIK only
*proposes* an exit, the user needs time to sign). Threshold is a stated assumption, tunable.

---

## 4. Phasing

- **P0 — Pipeline proof (USDC depeg, V3):** ~20 liquidated + ~20 survivor positions, full
  confusion matrix, one event. Goal: prove point-in-time reconstruction + oracle fidelity.
- **P1 — Strongest narrative (stETH depeg, V2):** add V2 reconstruction; build the
  per-position "would PANIK have saved you?" timeline visual.
- **P2 — Breadth (UST, FTX):** pooled accuracy across all events, sample sizes disclosed.
- **P3 — Calibration loop:** feed results back to tune `HF_CEIL`/`VOL_CEIL` (this is where
  §3.6's original intent gets satisfied as a *byproduct*).

Artifacts: `scripts/backtest/` harness (offline, deterministic) + a per-event scorecard
JSON + a methodology appendix. Everything reproducible from named Dune queries.

---

## 5. Open decisions for the team / lead

1. **What gets shown to users?** The defensible claim (§0) vs a simpler headline — pick one
   the data can actually support, and disclose the false-alarm rate alongside it.
2. **"Saved" lead-time threshold** — 6h? 1h? Changes the number materially; state it.
3. **Sample size & selection** — how many positions/event, and how survivors are sampled
   (random from active borrowers at event start) — fix this *before* seeing results to avoid
   p-hacking.
4. **Include the oracle-glitch event (#5) as a limitation**, not a win?
