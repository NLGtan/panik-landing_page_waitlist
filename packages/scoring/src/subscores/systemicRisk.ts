import { clamp } from "../math";
import { PROTO_FLOOR, SECTOR_FLOOR, SYSTEMIC_RISK_WEIGHTS } from "../params";
import type { SystemicRiskInput } from "../types";

/**
 * S_systemic_risk (15% of composite) — arch §Sub-Scores 4.
 * Near 0 during stable periods; saturates during FTX-style events.
 */
export function scoreSystemicRisk(input: SystemicRiskInput): number {
  const sectorChange7d =
    input.sectorTvl7dAgo > 0
      ? (input.sectorTvlNow - input.sectorTvl7dAgo) / input.sectorTvl7dAgo
      : 0;
  const protoChange7d =
    input.protocolTvl7dAgo > 0
      ? (input.protocolTvlNow - input.protocolTvl7dAgo) / input.protocolTvl7dAgo
      : 0;

  // A drop equal to the floor (e.g. −20% sector) scores 100; gains score 0.
  const sectorScore = clamp((-sectorChange7d / -SECTOR_FLOOR) * 100, 0, 100);
  const protoFlightScore = clamp((-protoChange7d / -PROTO_FLOOR) * 100, 0, 100);

  return clamp(
    SYSTEMIC_RISK_WEIGHTS.sector * sectorScore +
      SYSTEMIC_RISK_WEIGHTS.protocolFlight * protoFlightScore,
    0,
    100,
  );
}
