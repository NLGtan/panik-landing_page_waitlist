/**
 * One-time Telegram webhook registration.
 * Run:  npm run telegram:setup            (uses TELEGRAM_PUBLIC_BASE_URL)
 *       npm run telegram:setup -- <url>   (override base URL)
 *
 * Points the bot at <base>/api/telegram/webhook and registers the secret_token
 * the webhook handler checks (X-Telegram-Bot-Api-Secret-Token). Re-run after a
 * domain change. See docs/technical-docs/TELEGRAM_ALERTS.md.
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.argv[2] ?? process.env.TELEGRAM_PUBLIC_BASE_URL;

if (!token || !secret) {
  console.error("Missing env TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}
if (!baseUrl) {
  console.error("Missing base URL: set TELEGRAM_PUBLIC_BASE_URL or pass it as an arg");
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;

async function tg(method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main(): Promise<void> {
  console.log(`Setting webhook -> ${webhookUrl}`);
  const set = await tg("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  console.log("setWebhook:", JSON.stringify(set));

  const info = await tg("getWebhookInfo");
  console.log("getWebhookInfo:", JSON.stringify(info));
}

void main().catch((err) => {
  console.error(`telegram:setup failed: ${(err as Error).message}`);
  process.exit(1);
});
