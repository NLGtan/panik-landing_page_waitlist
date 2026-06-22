/**
 * Profile session — the timeout-proof start/poll orchestration behind the
 * serverless /api/profile/{start,result} endpoints. See WALLET_PROFILER.md §3
 * and the demo flow.
 *
 * Split so no single request runs long (Vercel Hobby-friendly):
 *   startProfileScan   — fire the Dune execution on wallet entry (~1s)
 *   resolveProfileScan — one non-blocking poll; classify + (combined) narrate
 *                        when ready, cache the on-chain result. Stays pure of
 *                        any concrete cache/DB — the app injects ProfileCache.
 */

import type { DuneHistoryProvider } from "../providers/duneHistory";
import type { OpenRouterNarrator, ProfileNarration } from "../providers/narrator";
import { fallbackCombined, fallbackNarration } from "../providers/narrator";
import { classifyWallet } from "./classifyWallet";
import { alignmentOf } from "./reconcile";
import type { Alignment, ProfileClassification, StatedProfile } from "./types";

/** What we persist per wallet (the expensive on-chain part; narration is not cached). */
export interface ProfileCacheEntry {
  classification: ProfileClassification;
  computedAt: number;
}

/** Injected persistence (Supabase in prod, in-memory in dev/tests). */
export interface ProfileCache {
  get(wallet: string): Promise<ProfileCacheEntry | null>;
  set(wallet: string, entry: ProfileCacheEntry): Promise<void>;
}

export interface SessionDeps {
  history: DuneHistoryProvider;
  cache: ProfileCache;
  /** Optional — without it (or on its failure) deterministic prose is used. */
  narrator?: OpenRouterNarrator;
  /** Cache freshness window. Default 24h. */
  ttlMs?: number;
}

/** The combined reveal payload returned to the client. */
export interface CombinedProfile extends ProfileClassification, ProfileNarration {
  stated?: StatedProfile;
  alignment?: Alignment;
}

export type StartResult =
  | { status: "ready" }
  | { status: "scanning"; executionId: string };

export type ResolveResult =
  | { status: "pending"; executionId?: string }
  | { status: "done"; profile: CombinedProfile };

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(entry: ProfileCacheEntry, ttlMs: number): boolean {
  return Date.now() - entry.computedAt < ttlMs;
}

/**
 * Begin profiling a wallet. If a fresh cached result exists, the caller can go
 * straight to resolve; otherwise we kick off the Dune execution and hand back
 * its id for the client to poll.
 */
export async function startProfileScan(wallet: string, deps: SessionDeps): Promise<StartResult> {
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS;
  const cached = await deps.cache.get(wallet);
  if (cached && isFresh(cached, ttl)) return { status: "ready" };
  const executionId = await deps.history.startExecution(wallet);
  return { status: "scanning", executionId };
}

/**
 * One non-blocking step toward the reveal. Resolves the on-chain classification
 * (from cache, or by polling the execution once), then narrates it — combined
 * with the quiz's `stated` profile when provided. Returns {pending} while the
 * Dune execution is still running.
 */
export async function resolveProfileScan(
  wallet: string,
  opts: { executionId?: string; stated?: StatedProfile },
  deps: SessionDeps,
): Promise<ResolveResult> {
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS;

  // 1 — on-chain classification: cache first, else poll the execution once.
  let entry = await deps.cache.get(wallet);
  if (!entry || !isFresh(entry, ttl)) {
    if (!opts.executionId) {
      // No execution to poll (lost id / direct call) — self-heal by starting one.
      const executionId = await deps.history.startExecution(wallet);
      return { status: "pending", executionId };
    }
    const polled = await deps.history.pollFeatures(opts.executionId);
    if (polled.status === "pending") return { status: "pending", executionId: opts.executionId };
    entry = { classification: classifyWallet(polled.features), computedAt: Date.now() };
    await deps.cache.set(wallet, entry);
  }

  // 2 — narrate. Combined (stated vs revealed) when the quiz result is present.
  const cls = entry.classification;
  let narration: ProfileNarration;
  let alignment: Alignment | undefined;
  if (opts.stated) {
    alignment = alignmentOf(opts.stated.riskProfile3, cls.profile);
    narration = deps.narrator
      ? await deps.narrator.narrateCombined(cls, opts.stated, alignment)
      : fallbackCombined(cls, opts.stated, alignment);
  } else {
    narration = deps.narrator ? await deps.narrator.narrate(cls) : fallbackNarration(cls);
  }

  return {
    status: "done",
    profile: { ...cls, ...narration, stated: opts.stated, alignment },
  };
}
