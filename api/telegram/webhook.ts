/**
 * POST /api/telegram/webhook
 * Receives Telegram bot updates (set via scripts/set-telegram-webhook.ts with a
 * secret_token). Handles the deep-link connect (/start <code>) and /stop.
 *
 * Fetch-only (Supabase REST + Telegram Bot API), no viem/pg. The secret header
 * is the auth boundary: the URL is public, so an unsigned request is rejected.
 * Mirrors api/profile/start.ts. See docs/technical-docs/TELEGRAM_ALERTS.md.
 */

// Specific module, NOT the @panik/scoring barrel (the barrel pulls viem ->
// isows -> ws, which crashes the Vercel bundle). truncateWallet has no I/O deps.
import { truncateWallet } from "../../packages/scoring/src/watch/alertMessage";
import { TelegramStore } from "../../server/telegramStore";
import { sendMessage } from "../../server/telegram";

interface Req {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res { status(code: number): Res; json(body: unknown): void }

interface TgUpdate {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { username?: string };
  };
}

function header(req: Req, name: string): string | undefined {
  const v = req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!secret || !token) {
    // Misconfiguration, not a caller error. Do not leak which is missing.
    res.status(503).json({ error: "telegram unconfigured" });
    return;
  }

  // Auth boundary: Telegram echoes the secret_token we registered.
  if (header(req, "x-telegram-bot-api-secret-token") !== secret) {
    res.status(401).json({ error: "bad secret" });
    return;
  }

  const update = (req.body ?? {}) as TgUpdate;
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  const username = update.message?.from?.username;

  // Nothing actionable (e.g. a non-message update). Ack so Telegram stops.
  if (typeof chatId !== "number" || !text) {
    res.status(200).json({ ok: true });
    return;
  }

  let store: TelegramStore;
  try {
    store = TelegramStore.fromEnv();
  } catch {
    res.status(503).json({ error: "telegram unconfigured" });
    return;
  }

  try {
    const startMatch = text.match(/^\/start(?:@\w+)?\s+(\S+)$/);
    if (startMatch) {
      const code = startMatch[1];
      const entry = await store.getLinkCode(code);
      if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) await store.consumeLinkCode(code); // sweep an expired code
        await sendMessage(token, chatId, "This link expired or is invalid. Open Panik and click Connect Telegram again.");
      } else {
        await store.upsertLink({ wallet: entry.wallet, chatId, username });
        await store.consumeLinkCode(code);
        await sendMessage(
          token,
          chatId,
          `Connected. Panik will alert this chat when wallet ${truncateWallet(entry.wallet)} nears your risk limit. Send /stop to disable.`,
        );
      }
    } else if (/^\/stop(?:@\w+)?$/.test(text)) {
      await store.disableLink(chatId);
      await sendMessage(token, chatId, "Alerts disabled. Send /start again from Panik to re-enable.");
    } else if (/^\/start(?:@\w+)?$/.test(text)) {
      await sendMessage(token, chatId, "Open Panik and click Connect Telegram to link this chat to your wallet.");
    } else {
      await sendMessage(token, chatId, "Unknown command. Connect from the Panik dashboard, or send /stop to disable alerts.");
    }
  } catch (err) {
    // Log-only: still ack 200 so Telegram does not retry-storm a transient error.
    console.error(`telegram webhook error: ${(err as Error).message}`);
  }

  res.status(200).json({ ok: true });
}
