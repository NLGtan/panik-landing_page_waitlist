/**
 * One-off live test for the wallet DeFi-persona profiler.
 * Run: node --env-file=.env --import tsx scripts/test-profile.ts <wallet>
 * Exercises the REAL Dune HTTP API + (if OPENROUTER_API_KEY present) the LLM.
 */

import {
  DuneHistoryProvider,
  OpenRouterNarrator,
  profileWallet,
} from "../packages/scoring/src/index";

const wallet = process.argv[2] ?? "0xaa40cb43f78b97701d0e5981d83822ed77dd57e9";

const duneKey = process.env.DUNE_API_KEY;
const orKey = process.env.OPENROUTER_API_KEY;
if (!duneKey) {
  console.error("DUNE_API_KEY missing in .env");
  process.exit(1);
}

const history = new DuneHistoryProvider(duneKey);
const narrator = orKey ? new OpenRouterNarrator(orKey) : undefined;

console.log(`\nProfiling ${wallet}`);
console.log(`Dune: live   |   Narrator: ${narrator ? "OpenRouter gemini-2.5-flash" : "deterministic fallback"}\n`);

const t0 = Date.now();
const p = await profileWallet(wallet, { history, narrator });
const ms = Date.now() - t0;

console.log("── FEATURES ─────────────────────────────────────────");
console.log(p.features);
console.log("\n── CLASSIFICATION (deterministic) ───────────────────");
console.log(`profile:          ${p.profile}`);
console.log(`riskAppetiteIndex: ${p.riskAppetiteIndex}`);
console.log(`confidence:        ${p.confidence}`);
console.log(`reasons:           ${p.reasons.join(" · ")}`);
console.log("\n── AI NARRATION ─────────────────────────────────────");
console.log(`tagline:     ${p.tagline}`);
console.log(`description: ${p.description}`);
console.log(`\n(done in ${(ms / 1000).toFixed(1)}s)`);
