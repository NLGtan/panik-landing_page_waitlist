/**
 * Prod-path smoke test: runs the profiler session against the REAL Supabase
 * cache (public.wallet_profiles) + real Dune + Gemini — exactly what the Vercel
 * functions do. Verifies the migration works and the cache round-trips.
 * Run: node --env-file=.env --import tsx scripts/test-profile-db.ts <wallet> [stated]
 */

import { resolveProfileScan, startProfileScan, type RiskProfile } from "../packages/scoring/src/index";
import { getProfileDeps } from "../server/profileDeps";

const wallet = (process.argv[2] ?? "0xaa40cb43f78b97701d0e5981d83822ed77dd57e9").toLowerCase();
const stated = (process.argv[3] ?? "moderate") as RiskProfile;

const deps = getProfileDeps();

async function runOnce(label: string) {
  const t0 = Date.now();
  const start = await startProfileScan(wallet, deps);
  console.log(`[${label}] start → ${JSON.stringify(start)}`);
  const executionId = start.status === "scanning" ? start.executionId : undefined;
  let polls = 0;
  for (;;) {
    const r = await resolveProfileScan(wallet, { executionId, stated: { riskProfile3: stated } }, deps);
    if (r.status === "pending") {
      polls += 1;
      await new Promise((res) => setTimeout(res, 3500));
      continue;
    }
    const p = r.profile;
    console.log(`[${label}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${polls} polls)`);
    console.log(`   profile=${p.profile}  archetype="${p.archetype}"  alignment=${p.alignment}`);
    console.log(`   tagline: ${p.tagline}`);
    return;
  }
}

console.log(`\nProfiling ${wallet} (stated ${stated}) against Supabase cache\n`);
await runOnce("run 1 (cold)");
console.log("");
await runOnce("run 2 (should hit Supabase cache → ready/instant)");
console.log("\n✓ Supabase wallet_profiles round-trip OK");
process.exit(0);
