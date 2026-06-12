import type { ProfileStatus, RiskProfile } from "./types";

/** Alert thresholds — arch §Risk Profiles / biz plan profile table. */
export const ALERT_THRESHOLD: Record<RiskProfile, number> = {
  conservative: 25,
  moderate: 50,
  aggressive: 75,
};

/** Width of the "Approaching" zone below the threshold (arch: 10 points). */
export const APPROACHING_WINDOW = 10;

/**
 * Position status relative to the USER's profile, not a generic band —
 * powers Watch's "Within / Approaching / Outside" display.
 */
export function statusFor(profile: RiskProfile, score: number): ProfileStatus {
  const threshold = ALERT_THRESHOLD[profile];
  if (score >= threshold) return "outside";
  if (score >= threshold - APPROACHING_WINDOW) return "approaching";
  return "within";
}
