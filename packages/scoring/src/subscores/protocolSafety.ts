import type { Protocol } from "../types";

/**
 * S_protocol_safety (20% of composite) — arch §Sub-Scores 3.
 * Static config — no runtime query. Update manually on new events
 * (and verify exploit records are complete before publishing: arch Q3).
 */

interface ProtocolSafetyConfig {
  auditScore: number;
  exploitScore: number;
  tvlStability: number;
  governance: number;
  /** [audit, exploit, tvlStability, governance] — must sum to 1. */
  weights: readonly [number, number, number, number];
}

export const PROTOCOL_SAFETY: Record<Protocol, ProtocolSafetyConfig> = {
  aave_v3: {
    auditScore: 90, // multiple top-tier audits
    exploitScore: 95, // no protocol-level insolvency
    tvlStability: 85,
    governance: 85,
    weights: [0.35, 0.35, 0.2, 0.1],
    // raw = 90.25 → S = 9.75 (LOW). arch's "≈ 11" comment is loose rounding.
  },
  moonwell: {
    auditScore: 60,
    exploitScore: 40, // 2 exploits in 8mo (Nov 2025 oracle, Feb 2026 cbETH)
    tvlStability: 65,
    governance: 60,
    weights: [0.35, 0.35, 0.2, 0.1],
    // raw = 54 → S = 46 (ELEVATED), matching arch exactly.
  },
  // ⚠ Added 2026-06-13 — initial estimates pending the same Q3 verification
  // bar as Aave/Moonwell (confirm exploit records before scores go public).
  morpho: {
    auditScore: 85, // 25+ audits + formal verification on the immutable Blue core
    exploitScore: 75, // no core exploit; Apr-2025 app/frontend incident (white-hatted); curator-layer risk is real
    tvlStability: 80, // #2 lending globally ($6.6B), strong growth; younger than Aave
    governance: 75, // minimal-governance immutable core (good) but curator/vault layer adds discretion
    weights: [0.35, 0.35, 0.2, 0.1],
    // raw = 0.35*85 + 0.35*75 + 0.2*80 + 0.1*75 = 79.5 → S = 20.5 (LOW, above Aave's 9.75)
  },
  compound_v3: {
    auditScore: 85, // OpenZeppelin/ChainSecurity audits; long Compound lineage
    exploitScore: 80, // no v3 insolvency; lineage incidents (2020 DAI oracle squeeze, 2021 COMP distribution bug) were costly but not v3
    tvlStability: 78, // $1.05B, mature but flat vs Aave's depth
    governance: 78, // established on-chain governance; slower cadence
    weights: [0.35, 0.35, 0.2, 0.1],
    // raw = 0.35*85 + 0.35*80 + 0.2*78 + 0.1*78 = 81.15 → S = 18.85 (LOW)
  },
};

/** Higher raw = safer protocol; inverted to the 0–100 risk scale. */
export function scoreProtocolSafety(protocol: Protocol): number {
  const p = PROTOCOL_SAFETY[protocol];
  const [wAudit, wExploit, wTvl, wGov] = p.weights;
  const raw =
    wAudit * p.auditScore +
    wExploit * p.exploitScore +
    wTvl * p.tvlStability +
    wGov * p.governance;
  return Math.round((100 - raw) * 100) / 100;
}
