/**
 * AI persona narrator — turns a deterministic classification into prose.
 * The LLM NARRATES, it never classifies (WALLET_PROFILER.md §3): the profile
 * and the numbers are passed in as ground truth and may not be changed.
 *
 * Provider: OpenRouter, google/gemini-2.5-flash. Server-side only — the key
 * never reaches the browser. Any failure degrades to a deterministic template.
 */

import type { ProfileClassification } from "../classify/types";
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
