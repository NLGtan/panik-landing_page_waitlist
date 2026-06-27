/**
 * POST/GET /api/telegram/link?wallet=0x...
 * Mints a single-use deep-link code for the wallet and returns the t.me deep
 * link the user opens to connect their Telegram. The user pressing Start fires
 * /api/telegram/webhook, which resolves the code to the wallet.
 *
 * Fast, fetch-only (Supabase REST), Vercel Hobby-safe. No viem/pg.
 * Mirrors api/profile/start.ts. See docs/technical-docs/TELEGRAM_ALERTS.md.
 */

import { randomUUID } from "node:crypto";
import { isEvmAddress } from "../../server/profileDeps";
import { TelegramStore } from "../../server/telegramStore";

interface Req { method?: string; query: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status(code: number): Res; json(body: unknown): void }

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Codes live 15 minutes. */
const CODE_TTL_MS = 15 * 60 * 1000;

export default async function handler(req: Req, res: Res): Promise<void> {
  const body = (req.body ?? {}) as { wallet?: string };
  const wallet = (pick(req.query.wallet) ?? body.wallet ?? "").trim().toLowerCase();

  if (!isEvmAddress(wallet)) {
    res.status(400).json({ error: "invalid EVM wallet address" });
    return;
  }

  const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    res.status(503).json({ error: "telegram unconfigured (VITE_TELEGRAM_BOT_USERNAME)" });
    return;
  }

  let store: TelegramStore;
  try {
    store = TelegramStore.fromEnv();
  } catch (err) {
    res.status(503).json({ error: `telegram unconfigured: ${(err as Error).message}` });
    return;
  }

  // url-safe, single-use; randomUUID is 122 bits of entropy.
  const code = randomUUID().replace(/-/g, "");
  try {
    await store.createLinkCode(code, wallet, CODE_TTL_MS);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }

  res.status(200).json({
    code,
    botUsername,
    deepLink: `https://t.me/${botUsername}?start=${code}`,
    expiresInSec: CODE_TTL_MS / 1000,
  });
}
