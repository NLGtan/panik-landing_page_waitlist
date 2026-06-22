/**
 * POST/GET /api/profile/start?wallet=0x…
 * Begins profiling: returns {status:"ready"} on a fresh cache hit, else kicks
 * off the Dune execution and returns {status:"scanning", executionId}.
 * Fast (~1s) — Vercel Hobby-safe. See docs/technical-docs/WALLET_PROFILER.md.
 */

import { startProfileScan } from "../../packages/scoring/src/index";
import { getProfileDeps, isEvmAddress } from "../../scripts/lib/profileDeps";

interface Req { method?: string; query: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status(code: number): Res; json(body: unknown): void }

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const body = (req.body ?? {}) as { wallet?: string };
  const wallet = (pick(req.query.wallet) ?? body.wallet ?? "").trim();

  if (!isEvmAddress(wallet)) {
    res.status(400).json({ error: "invalid EVM wallet address" });
    return;
  }

  let deps;
  try {
    deps = getProfileDeps();
  } catch (err) {
    res.status(503).json({ error: `profiler unconfigured: ${(err as Error).message}` });
    return;
  }

  try {
    const result = await startProfileScan(wallet.toLowerCase(), deps);
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
