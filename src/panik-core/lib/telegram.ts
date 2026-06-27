/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Telegram alert wiring for panik-core.
 *  - registerWatchedWallet: after onboarding, register the user's own wallet for
 *    monitoring via the register_watched_wallet SECURITY DEFINER RPC (publishable
 *    key, like the waitlist flow). Fire-and-forget; never blocks the UI.
 *  - useTelegramLink: mints a deep-link code from /api/telegram/link and opens
 *    t.me/<bot>?start=<code> so the user connects their Telegram.
 * See supabase/migrations/20260627000001_telegram_alerts.sql.
 */

import { useCallback, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export type RiskProfile = "conservative" | "moderate" | "aggressive";

export const isEvmAddress = (a: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(a.trim());

/**
 * Register the onboarded wallet for monitoring. Resolves true on success.
 * Swallows errors (returns false) so onboarding never blocks on it. No-op for
 * non-EVM wallets (the on-chain readers can't monitor them).
 */
export async function registerWatchedWallet(wallet: string, profile: RiskProfile): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY || !isEvmAddress(wallet)) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_watched_wallet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ p_wallet: wallet.trim().toLowerCase(), p_profile: profile }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type LinkStatus = "idle" | "requesting" | "opened" | "error";

interface LinkResponse {
  code: string;
  botUsername: string;
  deepLink: string;
}

/** Hook driving the "Connect Telegram" button. */
export function useTelegramLink() {
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (wallet: string) => {
    if (!isEvmAddress(wallet)) {
      setStatus("error");
      setError("Telegram alerts need an EVM wallet (0x...).");
      return;
    }
    setStatus("requesting");
    setError(null);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`http_${res.status}: ${txt.slice(0, 120)}`);
      }
      const data = (await res.json()) as LinkResponse;
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      setStatus("opened");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  }, []);

  return { status, error, connect };
}
