/**
 * AI persona narrator — turns a deterministic classification into prose.
 * The LLM NARRATES, it never classifies (WALLET_PROFILER.md §3): the profile
 * and the numbers are passed in as ground truth and may not be changed.
 *
 * Provider: OpenRouter, google/gemini-2.5-flash. Server-side only — the key
 * never reaches the browser. Any failure degrades to a deterministic template.
 */

import type { Alignment, ProfileClassification, StatedProfile } from "../classify/types";
import type { FetchFn } from "./types";

export interface ProfileNarration {
  tagline: string;
  description: string;
}

const SYSTEM_PROMPT = `You write a unique, personalized risk persona for one DeFi wallet.
You are given a fixed classification ("profile"), a descriptive "archetype", and a feature vector
— ALL are GROUND TRUTH. Never change the profile or archetype. Never invent numbers or facts not
present in the features. If a field is null, omit it (do not say "0 chains" or "unknown").

Return ONLY JSON: {"tagline": string, "description": string}
- tagline: one short line. Start with the profile capitalized (only first letter), an en-dash,
  then a qualifier drawn from the data (e.g. "disciplined" if liquidations=0 and most debt repaid;
  "battle-scarred" if liquidations>0; "dormant" if inactive a long time).
- description: 2-3 sentences that make THIS wallet feel distinct. Weave in its specific behavior:
  favorite protocol (topProtocol) and chain (topChain), what it supplies (topCollateralSymbol) and
  borrows (topBorrowSymbol), whether debt is stablecoin (stableBorrowPct, low directional risk) or
  volatile, leverage (borrowToDepositRatio), tenure (lendingAgeDays), liquidations, repay
  discipline, and recency (daysSinceLastActivity). Pick the 3-4 MOST telling, cite real values,
  and vary phrasing so no two wallets read alike. Max ~55 words.
Tone: sharp, factual, specific, no hype, no marketing fluff.`;

const COMBINED_SYSTEM_PROMPT = `You write a personalized risk persona for one DeFi wallet by reconciling TWO inputs:
1. "stated" — what the user said about themselves in a short onboarding quiz.
2. "onChain" — what their wallet's lifetime cross-chain history actually shows (GROUND TRUTH).
You are also given "alignment" (aligned | understated | overstated), already computed — DO NOT
recompute or contradict it. understated = the chain is riskier than they claimed; overstated =
the chain is tamer than they claimed.

Never change the onChain profile/archetype or invent numbers absent from the features. If a field
is null, omit it.

Return ONLY JSON: {"tagline": string, "description": string}
- tagline: one short line that headlines the RECONCILIATION. If understated/overstated, contrast
  them directly, e.g. "You said Moderate — your wallet says Aggressive." If aligned, affirm it,
  e.g. "Aggressive — and your wallet backs it up."
- description: 2-3 sentences. First acknowledge the stated intent, then ground it in the specific
  on-chain behavior (favorite protocol/chain, top collateral/borrow asset, stablecoin vs volatile
  debt, leverage ratio, liquidations, repay discipline, tenure, recency), citing real values. End
  with what this means for how Panik should watch them. Max ~60 words.
Tone: sharp, factual, specific, a little provocative when stated and revealed diverge. No hype.`;

export interface NarratorOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  fetchFn?: FetchFn;
}

export class OpenRouterNarrator {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly fetchFn: FetchFn;

  constructor(
    private readonly apiKey: string,
    opts: NarratorOptions = {},
  ) {
    this.baseUrl = opts.baseUrl ?? "https://openrouter.ai/api/v1";
    this.model = opts.model ?? "google/gemini-2.5-flash";
    this.temperature = opts.temperature ?? 0.4;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** Narrate; on any failure, fall back to the deterministic template. */
  async narrate(classification: ProfileClassification): Promise<ProfileNarration> {
    try {
      return await this.callLlm(classification);
    } catch {
      return fallbackNarration(classification);
    }
  }

  /**
   * Narrate the reconciliation of the quiz's stated profile against the
   * on-chain verdict. `alignment` is precomputed (deterministic); the LLM only
   * phrases it. Falls back to deterministic prose on any failure.
   */
  async narrateCombined(
    classification: ProfileClassification,
    stated: StatedProfile,
    alignment: Alignment,
  ): Promise<ProfileNarration> {
    try {
      return await this.callLlmCombined(classification, stated, alignment);
    } catch {
      return fallbackCombined(classification, stated, alignment);
    }
  }

  private async callLlmCombined(
    c: ProfileClassification,
    stated: StatedProfile,
    alignment: Alignment,
  ): Promise<ProfileNarration> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: COMBINED_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              stated,
              alignment,
              onChain: { profile: c.profile, archetype: c.archetype, features: c.features },
            }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter: empty completion");
    const parsed = JSON.parse(content) as Partial<ProfileNarration>;
    if (!parsed.tagline || !parsed.description) throw new Error("OpenRouter: malformed JSON");
    return { tagline: parsed.tagline, description: parsed.description };
  }

  private async callLlm(c: ProfileClassification): Promise<ProfileNarration> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              profile: c.profile,
              archetype: c.archetype,
              features: c.features,
            }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter: empty completion");
    const parsed = JSON.parse(content) as Partial<ProfileNarration>;
    if (!parsed.tagline || !parsed.description) throw new Error("OpenRouter: malformed JSON");
    return { tagline: parsed.tagline, description: parsed.description };
  }
}

/** Deterministic narration from the classifier's own reasons — the safe fallback. */
export function fallbackNarration(c: ProfileClassification): ProfileNarration {
  const Profile = c.profile.charAt(0).toUpperCase() + c.profile.slice(1);
  const disciplined = c.features.borrowEvents > 0 && c.features.liquidations === 0;
  const qualifier =
    c.features.lendingTxCount === 0
      ? "no on-chain lending footprint yet"
      : c.features.liquidations > 0
        ? "battle-scarred — has been liquidated"
        : disciplined
          ? "disciplined — no liquidation history"
          : "based on lifetime on-chain behavior";
  return {
    // Lead with the unique archetype so even the fallback reads distinctly.
    tagline: `${Profile} — ${c.archetype}, ${qualifier}.`,
    description: c.reasons.length ? `${c.reasons.join(". ")}.` : `${Profile} risk profile.`,
  };
}

/** Deterministic reconciliation narration — the safe fallback for narrateCombined. */
export function fallbackCombined(
  c: ProfileClassification,
  stated: StatedProfile,
  alignment: Alignment,
): ProfileNarration {
  const Stated = stated.riskProfile3.charAt(0).toUpperCase() + stated.riskProfile3.slice(1);
  const OnChain = c.profile.charAt(0).toUpperCase() + c.profile.slice(1);
  const tagline =
    alignment === "aligned"
      ? `${OnChain} — and your wallet backs it up.`
      : `You said ${Stated} — your wallet says ${OnChain}.`;
  const lead =
    alignment === "aligned"
      ? `Your answers and your on-chain history agree.`
      : alignment === "understated"
        ? `You describe yourself as ${stated.riskProfile3}, but on-chain you take more risk.`
        : `You describe yourself as ${stated.riskProfile3}, but on-chain you play it safer.`;
  const body = c.reasons.length ? ` ${c.reasons.join(". ")}.` : "";
  return { tagline, description: `${lead}${body}` };
}
