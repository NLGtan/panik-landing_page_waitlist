/**
 * Telegram Bot API send helper. Pure fetch (no viem/pg), so it bundles cleanly
 * in a Vercel serverless function and also runs in the standalone worker.
 *
 * The dispatcher stamps watch_transitions.notified_at only when ok === true, so
 * a transient failure (429/5xx) leaves the row for the next poll.
 */

export interface TelegramSendResult {
  /** Telegram's own ok flag (its JSON body), AND the HTTP request succeeded. */
  ok: boolean;
  /** HTTP status (or 0 if the request never completed). */
  status: number;
  /** Telegram error_code when ok is false (e.g. 403 = blocked, 429 = rate). */
  errorCode?: number;
  description?: string;
}

export interface SendOptions {
  parseMode?: "MarkdownV2" | "HTML";
  disablePreview?: boolean;
  signal?: AbortSignal;
}

/**
 * POST sendMessage. Returns a structured result instead of throwing so callers
 * can branch on errorCode (403 -> disable link, 429 -> back off, else retry).
 */
export async function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
  opts: SendOptions = {},
): Promise<TelegramSendResult> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode,
        disable_web_page_preview: opts.disablePreview ?? true,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    return { ok: false, status: 0, description: (err as Error).message };
  }

  let body: { ok?: boolean; error_code?: number; description?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON body (rare); fall back to HTTP status.
  }

  return {
    ok: res.ok && body.ok === true,
    status: res.status,
    errorCode: body.error_code,
    description: body.description,
  };
}

/**
 * Register the bot's webhook with Telegram (idempotent). Called on API boot so
 * /start updates are delivered without a manual `telegram:setup`. `secret` is
 * echoed back by Telegram in the X-Telegram-Bot-Api-Secret-Token header, which
 * the webhook handler checks.
 */
export async function setWebhook(
  token: string,
  url: string,
  secret: string,
): Promise<TelegramSendResult> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
    });
  } catch (err) {
    return { ok: false, status: 0, description: (err as Error).message };
  }
  let body: { ok?: boolean; error_code?: number; description?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON body (rare); fall back to HTTP status.
  }
  return { ok: res.ok && body.ok === true, status: res.status, errorCode: body.error_code, description: body.description };
}
