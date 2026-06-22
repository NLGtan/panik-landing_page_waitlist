/**
 * Wallet-profiler orchestrator: Dune history → deterministic classify → AI
 * narration. The one entry point the backend calls at login.
 * See docs/technical-docs/WALLET_PROFILER.md §3.
 */

import type { DuneHistoryProvider } from "../providers/duneHistory";
import type { OpenRouterNarrator, ProfileNarration } from "../providers/narrator";
import { fallbackNarration } from "../providers/narrator";
import { classifyWallet } from "./classifyWallet";
import type { ProfileClassification } from "./types";

export interface WalletProfile extends ProfileClassification, ProfileNarration {}

export interface ProfileWalletDeps {
  history: DuneHistoryProvider;
  /** Optional — when absent (or it fails), deterministic fallback prose is used. */
  narrator?: OpenRouterNarrator;
}

/**
 * Full profile for one wallet: the verdict + the narrated prose + the features.
 * The classification is deterministic; only the prose comes from the LLM, which
 * degrades to a deterministic template on any failure.
 */
export async function profileWallet(
  wallet: string,
  deps: ProfileWalletDeps,
): Promise<WalletProfile> {
  const features = await deps.history.getFeatures(wallet);
  const classification = classifyWallet(features);
  const narration = deps.narrator
    ? await deps.narrator.narrate(classification)
    : fallbackNarration(classification);
  return { ...classification, ...narration };
}
