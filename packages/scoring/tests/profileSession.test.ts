import { describe, expect, it } from "vitest";
import { alignmentOf } from "../src/classify/reconcile";
import {
  resolveProfileScan,
  startProfileScan,
  type ProfileCache,
  type ProfileCacheEntry,
  type SessionDeps,
} from "../src/classify/profileSession";
import { classifyWallet } from "../src/classify/classifyWallet";
import type { WalletFeatures } from "../src/classify/types";
import { EMPTY_FEATURES } from "../src/providers/duneHistory";

const AGGRESSIVE: WalletFeatures = {
  ...EMPTY_FEATURES,
  lendingTxCount: 13854,
  chainsActive: 10,
  protocolsUsed: 6,
  protocols: ["aave", "compound", "moonwell", "morpho", "benqi", "sonne_finance"],
  lendingAgeDays: 1552,
  borrowedUsd: 88_551_790,
  depositedUsd: 102_190_253,
  repaidUsd: 87_809_786,
  borrowEvents: 2897,
  borrowToDepositRatio: 0.867,
  topProtocol: "aave",
  topChain: "avalanche_c",
  topCollateralSymbol: "USDC",
  topBorrowSymbol: "USDt",
  stableBorrowPct: 0.777,
};

/** In-memory cache + scripted Dune provider — no network. */
class FakeCache implements ProfileCache {
  store = new Map<string, ProfileCacheEntry>();
  get = async (w: string) => this.store.get(w) ?? null;
  set = async (w: string, e: ProfileCacheEntry) => void this.store.set(w, e);
}

function fakeHistory(opts: { readyAfter: number; features?: WalletFeatures }) {
  let polls = 0;
  return {
    startExecution: async () => "exec-1",
    pollFeatures: async () => {
      polls += 1;
      return polls >= opts.readyAfter
        ? { status: "done" as const, features: opts.features ?? AGGRESSIVE }
        : { status: "pending" as const };
    },
  } as unknown as SessionDeps["history"];
}

describe("alignmentOf (deterministic stated-vs-revealed)", () => {
  it("same bucket → aligned", () => {
    expect(alignmentOf("aggressive", "aggressive")).toBe("aligned");
  });
  it("chain riskier than claimed → understated", () => {
    expect(alignmentOf("moderate", "aggressive")).toBe("understated");
    expect(alignmentOf("conservative", "moderate")).toBe("understated");
  });
  it("chain tamer than claimed → overstated", () => {
    expect(alignmentOf("aggressive", "conservative")).toBe("overstated");
  });
});

describe("startProfileScan", () => {
  it("cache miss → scanning + executionId", async () => {
    const deps: SessionDeps = { history: fakeHistory({ readyAfter: 1 }), cache: new FakeCache() };
    const r = await startProfileScan("0xabc", deps);
    expect(r).toEqual({ status: "scanning", executionId: "exec-1" });
  });

  it("fresh cache hit → ready (no Dune execution)", async () => {
    const cache = new FakeCache();
    cache.store.set("0xabc", { classification: classifyWallet(AGGRESSIVE), computedAt: Date.now() });
    let started = false;
    const history = {
      startExecution: async () => { started = true; return "x"; },
      pollFeatures: async () => ({ status: "pending" as const }),
    } as unknown as SessionDeps["history"];
    const r = await startProfileScan("0xabc", { history, cache });
    expect(r).toEqual({ status: "ready" });
    expect(started).toBe(false);
  });
});

describe("resolveProfileScan", () => {
  it("pending while the execution runs", async () => {
    const deps: SessionDeps = { history: fakeHistory({ readyAfter: 2 }), cache: new FakeCache() };
    const r = await resolveProfileScan("0xabc", { executionId: "exec-1" }, deps);
    expect(r.status).toBe("pending");
  });

  it("done → combined profile with deterministic alignment + fallback prose", async () => {
    const deps: SessionDeps = { history: fakeHistory({ readyAfter: 1 }), cache: new FakeCache() };
    const r = await resolveProfileScan(
      "0xabc",
      { executionId: "exec-1", stated: { riskProfile3: "moderate" } },
      deps,
    );
    expect(r.status).toBe("done");
    if (r.status !== "done") return;
    expect(r.profile.profile).toBe("aggressive");
    expect(r.profile.alignment).toBe("understated"); // said moderate, chain says aggressive
    expect(r.profile.tagline).toContain("Moderate");
    expect(r.profile.tagline).toContain("Aggressive");
    expect(r.profile.archetype).toContain("Leveraged stable-yield operator");
  });

  it("caches the classification so a second resolve skips polling", async () => {
    const cache = new FakeCache();
    const history = fakeHistory({ readyAfter: 1 });
    await resolveProfileScan("0xabc", { executionId: "exec-1" }, { history, cache });
    expect(cache.store.has("0xabc")).toBe(true);

    let polled = false;
    const history2 = {
      startExecution: async () => "y",
      pollFeatures: async () => { polled = true; return { status: "pending" as const }; },
    } as unknown as SessionDeps["history"];
    const r = await resolveProfileScan("0xabc", { stated: { riskProfile3: "aggressive" } }, { history: history2, cache });
    expect(r.status).toBe("done");
    expect(polled).toBe(false);
    if (r.status === "done") expect(r.profile.alignment).toBe("aligned");
  });
});
