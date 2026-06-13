/**
 * Live data hooks — panik-core's only bridge to the scoring API.
 * Every hook degrades gracefully (returns null / offline=true) so the demo
 * stays fully functional without `npm run dev:api`.
 */

import { useEffect, useRef, useState } from "react";

export type Band = "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";

export interface SubScores {
  positionHealth: number;
  assetRisk: number;
  protocolSafety: number;
  systemicRisk: number;
}

export type LiveProtocol = "aave_v3" | "moonwell" | "morpho" | "compound_v3";

export interface LiveWalletPosition {
  protocol: LiveProtocol;
  wallet: string;
  total: number;
  band: Band;
  subScores: SubScores;
  healthFactor: number | null;
  collateralValueUsd: number;
  borrowValueUsd: number;
  scoredCollateralSymbol: string;
  label: string | null;
  riskProfile: string;
  profileStatus: "within" | "approaching" | "outside";
}

export interface CompassLiveScore {
  id: string;
  total: number;
  band: Band;
  subScores: SubScores;
  healthFactor: number | null;
  liquidationDrawdown: number | null;
}

export interface ProspectiveLive {
  total: number;
  band: Band;
  subScores: SubScores;
  healthFactor: number | null;
  liquidationDrawdown: number | null;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** Poll a JSON endpoint on an interval; null until first success. */
function usePolled<T>(url: string, intervalMs: number): { data: T | null; offline: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const body = await getJson<T>(url);
        if (!cancelled) {
          setData(body);
          setOffline(false);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    void load();
    const t = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [url, intervalMs]);

  return { data, offline };
}

/** Live wallet positions from the watch registry (60s — arch cadence). */
export function useLiveScores() {
  const { data, offline } = usePolled<{ updatedAt: number; positions: LiveWalletPosition[] }>(
    "/api/scores",
    60_000,
  );
  return { positions: data?.positions ?? null, updatedAt: data?.updatedAt ?? 0, offline };
}

/** Live prospective scores for the Compass presets, keyed by preset id. */
export function useCompassScores() {
  const { data, offline } = usePolled<{ updatedAt: number; scores: CompassLiveScore[] }>(
    "/api/compass",
    60_000,
  );
  const byId: Record<string, CompassLiveScore> | null = data
    ? Object.fromEntries(data.scores.map((s) => [s.id, s]))
    : null;
  return { scores: byId, offline };
}

export interface RegistryWallet {
  wallet: string;
  risk_profile: string;
  label: string | null;
}

/** The watch registry — selector source, independent of scoreability. */
export function useWalletRegistry() {
  const { data } = usePolled<{ wallets: RegistryWallet[] }>("/api/wallets", 60_000);
  return data?.wallets ?? null;
}

/** Real Base block number + gas price (15s). */
export function useChainTelemetry() {
  const { data } = usePolled<{ blockNumber: number; gasGwei: number }>("/api/chain", 15_000);
  return { blockNumber: data?.blockNumber ?? null, gasGwei: data?.gasGwei ?? null };
}

export interface ProspectiveArgs {
  protocol: "aave_v3" | "moonwell";
  symbol: string;
  collateralUsd: number;
  borrowUsd: number;
}

/**
 * Debounced live scoring for the Watch sliders. Aborts stale requests so
 * fast dragging never renders an out-of-date score.
 */
export function useProspective(args: ProspectiveArgs): ProspectiveLive | null {
  const [result, setResult] = useState<ProspectiveLive | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const q = new URLSearchParams({
        protocol: args.protocol,
        symbol: args.symbol,
        collateralUsd: String(args.collateralUsd),
        borrowUsd: String(args.borrowUsd),
      });
      getJson<ProspectiveLive>(`/api/prospective?${q}`, ctrl.signal)
        .then(setResult)
        .catch(() => {
          if (!ctrl.signal.aborted) setResult(null); // offline → caller falls back to mock
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [args.protocol, args.symbol, args.collateralUsd, args.borrowUsd]);

  return result;
}
