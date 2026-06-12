import { describe, expect, it, vi } from "vitest";
import { WatchService, type WatchTransition } from "../src/watch/loop";

describe("WatchService", () => {
  it("emits on first observation, stays silent while stable, fires on change", async () => {
    const totals = [30, 30, 55]; // moderate profile: within, within, outside
    let call = 0;
    const transitions: WatchTransition[] = [];

    const service = new WatchService({
      scoreWallet: async (wallet) => [
        { protocol: "aave_v3", wallet, total: totals[call] ?? 55, band: "ELEVATED" },
      ],
      profileFor: () => "moderate",
      onTransition: (t) => transitions.push(t),
    });
    service.watch("0xABC"); // normalised to lowercase internally

    await service.tick(); // first observation → within (from null)
    call = 1;
    await service.tick(); // unchanged → no event
    call = 2;
    await service.tick(); // 55 ≥ 50 → outside

    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toMatchObject({ from: null, to: "within", score: 30 });
    expect(transitions[1]).toMatchObject({ from: "within", to: "outside", score: 55 });
  });

  it("routes scoring failures to onError without killing the loop", async () => {
    const onError = vi.fn();
    const good = vi.fn(async (_wallet: string) => []);
    const service = new WatchService({
      scoreWallet: async (w) => {
        if (w === "0xbad") throw new Error("rpc down");
        return good(w);
      },
      profileFor: () => "moderate",
      onTransition: () => {},
      onError,
    });
    service.watch("0xbad");
    service.watch("0xgood");

    await service.tick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1); // the good wallet still got scored
  });
});
