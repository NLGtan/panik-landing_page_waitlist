/**
 * Stated-vs-revealed reconciliation — deterministic. Compares the onboarding
 * quiz's self-reported risk bucket against the on-chain verdict so the AI can
 * narrate the gap ("you said Moderate — chain says Aggressive"). The LLM never
 * decides this; it only phrases the value computed here.
 */

import type { RiskProfile } from "../types";
import type { Alignment } from "./types";

const ORDER: Record<RiskProfile, number> = {
  conservative: 0,
  moderate: 1,
  aggressive: 2,
};

/**
 * @param stated   the quiz's riskProfile3
 * @param onChain  the profiler's verdict
 * @returns aligned | understated | overstated (from the USER's perspective:
 *          "understated" = they claimed less risk than the chain shows)
 */
export function alignmentOf(stated: RiskProfile, onChain: RiskProfile): Alignment {
  const delta = ORDER[onChain] - ORDER[stated];
  if (delta === 0) return "aligned";
  return delta > 0 ? "understated" : "overstated";
}
