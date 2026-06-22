/**
 * Live test for the wallet profiler's start/poll session (the prod path).
 * Run: node --env-file=.env --import tsx scripts/test-profile.ts <wallet> [statedProfile]
 * Uses the REAL Dune HTTP API + (if OPENROUTER_API_KEY present) the LLM, with
 * an in-memory cache standing in for Supabase.
 */

import {
  DuneHistoryProvider,
  OpenRouterNarrator,
  resolveProfileScan,
  startProfileScan,
  type ProfileCache,
  type ProfileCacheEntry,
  type RiskProfile,
  type SessionDeps,
} from "../packages/scoring/src/index";

const wallet = (process.argv[2] ?? "0xaa40cb43f78b97701d0e5981d83822ed77dd57e9").toLowerCase();
const stated = (process.argv[3] ?? "moderate") as RiskProfile;

const duneKey = process.env.DUNE_API_KEY;
const orKey = process.env.OPENROUTER_API_KEY;
if (!duneKey) {
  console.error("DUNE_API_KEY missing in .env");
  process.exit(1);
}

const mem = new Map<string, ProfileCacheEntry>();
const cache: ProfileCache = {
  get: async (w) => mem.get(w) ?? null,
  set: async (w, e) => void mem.set(w, e),
};
const deps: SessionDeps = {
  history: new DuneHistoryProvider(duneKey),
  cache,
  narrator: orKey ? new OpenRouterNarrator(orKey) : undefined,
};

console.log(`\nProfiling ${wallet}`);
console.log(`Stated (quiz): ${stated}   |   Narrator: ${deps.narrator ? "gemini-2.5-flash" : "fallback"}\n`);

const t0 = Date.now();
const start = await startProfileScan(wallet, deps);
console.log(`start → ${JSON.stringify(start)}`);

const executionId = start.status === "scanning" ? start.executionId : undefined;
let polls = 0;
for (;;) {
  const r = await resolveProfileScan(wallet, { executionId, stated: { riskProfile3: stated } }, deps);
  if (r.status === "pending") {
    polls += 1;
    process.stdout.write(`  poll ${polls}: pending…\r`);
    await new Promise((res) => setTimeout(res, 3500));
    continue;
  }
  const p = r.profile;
  console.log(`\n\n── CLASSIFICATION (deterministic) ───────────────────`);
  console.log(`onChain profile:   ${p.profile}   (index ${p.riskAppetiteIndex}, confidence ${p.confidence})`);
  console.log(`archetype:         ${p.archetype}`);
  console.log(`stated (quiz):     ${p.stated?.riskProfile3}`);
  console.log(`alignment:         ${p.alignment}`);
  console.log(`\n── AI NARRATION (combined) ──────────────────────────`);
  console.log(`tagline:     ${p.tagline}`);
  console.log(`description: ${p.description}`);
  console.log(`\n(done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${polls} polls)`);
  break;
}
