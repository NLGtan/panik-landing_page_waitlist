# PANIK — MVP Assessment & Verdict

> Product readiness assessment for **level 3–5 DeFi users** (leveraged lending borrowers who care
> about liquidation risk). Grounded in the validation program — see
> [BACKTEST_OVERVIEW](./technical-docs/BACKTEST_OVERVIEW.md). 2026-06-18.

## Verdict (one line)

**A credible, evidence-backed MVP — a clear win for level 3–4 borrowers, and a feeder (not yet a
keeper) for level 5 until it adds one-click/automated exit and broader scope.**

## What it is, and what's actually proven

PANIK is a non-custodial, read-only risk monitor that scores leveraged lending positions
(Aave / Moonwell / Morpho / Compound) and warns before liquidation. Unlike most "risk score" tools,
the engine is **measured, not asserted**, on real historical crashes:

| Evidence | Result |
| --- | --- |
| Lead time before liquidation (June 2022, $40M whale) | **17h → 44h** with the crash-regime escalation |
| Recall — flagged before liquidation (4 crashes, full population) | **89%** pooled |
| False-alarm rate | ~**27%** (intrinsic in deep crashes) |
| Scope validated | WETH/stable + USDC-collateral, Aave V2 Ethereum, 4 black swans, ~6,800 wallets |
| Same engine runs live | Yes — real-time API + forward-test on current positions |

## Why it's a good MVP for level 3–4

1. **The core job is real and proven.** These users genuinely fear liquidation; we can show measured
   early-warning, not a vibe. In a category full of unaudited vaporware, **honest validation is itself
   a moat.**
2. **Right trust posture.** Non-custodial, read-only, scored against the same oracle the protocol
   liquidates on. Sophisticated users distrust custody and hand-wavy abstractions; PANIK respects both.
3. **Multi-protocol aggregation** — one view instead of four tabs.
4. **Live, not theoretical** — the validated engine is the one actually scoring positions in real time.

## Honest gaps for this audience

1. **The "it's just health factor" critique is partly fair** — and our own backtest surfaced it: the
   static HF≤1.10 floor already catches almost everything; the escalation's real value is *lead time*
   on fast crashes. The differentiation must be marketed as **earlier warning + curated composite +
   not having to build it yourself**, not "we have a score."
2. **Alerts ≠ action.** Level 4–5 users increasingly want *automation* (auto-deleverage, one-click
   exit). The exit MVP is parked; against free alerting, a pure-alert tool has a thin wedge at the top.
3. **Scope is narrower than how level-5 users trade** — multi-chain, exotic collateral, looped
   positions are not yet covered.
4. **Alert fatigue risk** — ~27% false alarms in deep crashes; needs per-user risk profiles (partly
   built) and crisp "why now" explanations.

## Recommendation

- **Ship to level 3–4 now.** Win on trust + convenience + validated early warning; use them to
  validate the wedge.
- **Lead with lead time, pair it with action.** The pitch that earns level-3–5 users is *"we warn you
  ~2 days before liquidation **and** let you exit in one click"* — not *"we show you a risk score."*
  Prioritize the parked exit MVP.
- **Expand scope deliberately** (BTC/alt collateral, Aave V3 / Base, more protocols) to convert level-5
  users from feeders into keepers.

## Bottom line

The validation work makes PANIK **trustworthy where competitors are not** — that's the foundation of a
real MVP for risk-aware borrowers. The product gap is **action and breadth**, not credibility. Build
the wedge on the one thing the data proved is genuinely additive — *lead time* — and convert it into
a one-click exit.
