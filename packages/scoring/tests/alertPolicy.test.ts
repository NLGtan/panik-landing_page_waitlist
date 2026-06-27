import { describe, expect, it } from "vitest";
import { decideSend } from "../src/watch/alertPolicy";
import { ALERT_POLICY } from "../src/params";

const t0 = Date.parse("2026-06-27T00:00:00Z");

describe("decideSend", () => {
  it("suppresses positions with no debt (HF null)", () => {
    expect(
      decideSend({ toStatus: "outside", createdAt: t0, healthFactor: null, borrowUsd: 5000, prior: null }),
    ).toBe("suppressed_immaterial");
  });

  it("suppresses sub-dust borrow", () => {
    expect(
      decideSend({ toStatus: "outside", createdAt: t0, healthFactor: 1.05, borrowUsd: ALERT_POLICY.minBorrowUsd - 1, prior: null }),
    ).toBe("suppressed_immaterial");
  });

  it("sends the first material alert", () => {
    expect(
      decideSend({ toStatus: "approaching", createdAt: t0, healthFactor: 1.2, borrowUsd: 800, prior: null }),
    ).toBe("send");
  });

  it("suppresses a same-severity re-crossing inside the cooldown window", () => {
    expect(
      decideSend({
        toStatus: "outside",
        createdAt: t0 + ALERT_POLICY.cooldownMs - 1,
        healthFactor: 1.05,
        borrowUsd: 800,
        prior: { toStatus: "outside", createdAt: t0 },
      }),
    ).toBe("suppressed_cooldown");
  });

  it("sends again once the cooldown has elapsed", () => {
    expect(
      decideSend({
        toStatus: "outside",
        createdAt: t0 + ALERT_POLICY.cooldownMs,
        healthFactor: 1.05,
        borrowUsd: 800,
        prior: { toStatus: "outside", createdAt: t0 },
      }),
    ).toBe("send");
  });

  it("escalation approaching -> outside bypasses the cooldown", () => {
    expect(
      decideSend({
        toStatus: "outside",
        createdAt: t0 + 60_000, // well within cooldown
        healthFactor: 1.05,
        borrowUsd: 800,
        prior: { toStatus: "approaching", createdAt: t0 },
      }),
    ).toBe("send");
  });
});
