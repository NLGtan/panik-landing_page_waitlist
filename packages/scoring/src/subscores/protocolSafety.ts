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
