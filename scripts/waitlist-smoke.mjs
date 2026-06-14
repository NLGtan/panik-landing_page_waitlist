// Waitlist backend smoke / integration test.
// Hits the EXACT REST/RPC path the browser uses (publishable key), plus
// privileged checks via the secret key. Run: node --env-file=.env scripts/waitlist-smoke.mjs
import "dotenv/config";

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !ANON || !SECRET) { console.error("Missing env"); process.exit(2); }

const ts = Date.now();
const emailA = `smoke_${ts}_a@example.com`;   // aggressive
const emailB = `smoke_${ts}_b@example.com`;   // conservative
const emailHP = `smoke_${ts}_hp@example.com`; // honeypot (should NOT insert)
const walletA = "0x" + "a".repeat(40);
const walletB = "0x" + "b".repeat(40);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

async function rpc(fn, args, key = ANON) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}
async function rest(path, key = ANON, method = "GET") {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}
const valid = (extra) => ({
  p_email: emailA, p_wallet: walletA,
  p_q1_defi_activity: "active_3_plus", p_q2_liquidation: "yes_accept",
  p_q3_risk_tracking: ["custom_alerts", "protocol_alerts"],
  p_q4_frustrations: ["silent_risk", "slow_reaction"],
  p_q5_portfolio_size: "gt_200k", p_additional_notes: "smoke", p_honeypot: "",
  ...extra,
});

console.log(`\n— Waitlist smoke test @ ${URL} —\n`);

// 1. baseline count (anon)
const c0 = await rpc("waitlist_count", {});
ok("waitlist_count callable by anon, returns number", c0.status === 200 && typeof c0.body === "number", `count=${c0.body}`);
const base = typeof c0.body === "number" ? c0.body : 0;

// 2. signup A (aggressive)
const sA = await rpc("waitlist_signup", valid({}));
ok("signup A inserts, returns position", sA.status === 200 && typeof sA.body === "number", `pos=${sA.body}`);
const posA = sA.body;

// 3. count incremented by exactly 1
const c1 = await rpc("waitlist_count", {});
ok("count incremented by 1 after signup", c1.body === base + 1, `was ${base}, now ${c1.body}`);

// 4. idempotent on email
const sA2 = await rpc("waitlist_signup", valid({}));
const c2 = await rpc("waitlist_count", {});
ok("duplicate email is idempotent (same position, no new row)", sA2.body === posA && c2.body === base + 1, `pos=${sA2.body}, count=${c2.body}`);

// 5. honeypot → returns 0, no row
const sHP = await rpc("waitlist_signup", valid({ p_email: emailHP, p_honeypot: "i-am-a-bot" }));
const c3 = await rpc("waitlist_count", {});
ok("honeypot filled → returns 0 and inserts nothing", sHP.body === 0 && c3.body === base + 1, `ret=${sHP.body}, count=${c3.body}`);

// 6. invalid wallet rejected by CHECK
const sBadW = await rpc("waitlist_signup", valid({ p_email: `smoke_${ts}_badw@example.com`, p_wallet: "0x123" }));
ok("invalid wallet rejected (CHECK)", sBadW.status >= 400, `status=${sBadW.status}`);

// 7. Q4 > 2 rejected by CHECK
const sBadQ4 = await rpc("waitlist_signup", valid({ p_email: `smoke_${ts}_badq@example.com`, p_q4_frustrations: ["silent_risk", "slow_reaction", "no_unified_view"] }));
ok("Q4 with 3 selections rejected (CHECK)", sBadQ4.status >= 400, `status=${sBadQ4.status}`);

// 8. signup B (conservative) for appetite check
const sB = await rpc("waitlist_signup", valid({
  p_email: emailB, p_wallet: walletB,
  p_q1_defi_activity: "never", p_q2_liquidation: "no_unsure",
  p_q3_risk_tracking: [], p_q4_frustrations: [], p_q5_portfolio_size: "lt_1k",
}));
ok("signup B inserts", sB.status === 200 && typeof sB.body === "number", `pos=${sB.body}`);

// 9. RLS: anon CANNOT read the table
const leakT = await rest("waitlist_signups?select=id", ANON);
ok("RLS deny-all: anon read of table returns no rows", Array.isArray(leakT.body) && leakT.body.length === 0, `status=${leakT.status}, body=${JSON.stringify(leakT.body).slice(0,120)}`);

// 10. CRITICAL: anon CANNOT read the enriched view (view footgun check)
const leakV = await rest("waitlist_enriched?select=email", ANON);
const viewSafe = (Array.isArray(leakV.body) && leakV.body.length === 0) || leakV.status === 401 || leakV.status === 403 || leakV.status === 404;
ok("anon read of waitlist_enriched view is NOT a data leak", viewSafe, `status=${leakV.status}, rows=${Array.isArray(leakV.body) ? leakV.body.length : "n/a"}`);

// 11. service key: derived appetite correct (A=aggressive, B=conservative)
const enr = await rest(`waitlist_enriched?select=email,risk_appetite,position&email=in.(${emailA},${emailB})`, SECRET);
const rowA = Array.isArray(enr.body) ? enr.body.find((r) => r.email === emailA) : null;
const rowB = Array.isArray(enr.body) ? enr.body.find((r) => r.email === emailB) : null;
ok("derived appetite A = aggressive", rowA?.risk_appetite === "aggressive", `got=${rowA?.risk_appetite}`);
ok("derived appetite B = conservative", rowB?.risk_appetite === "conservative", `got=${rowB?.risk_appetite}`);

// 12. cleanup test rows
const del = await fetch(`${URL}/rest/v1/waitlist_signups?email=in.(${emailA},${emailB})`, {
  method: "DELETE",
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, Prefer: "return=representation" },
});
const delBody = await del.json().catch(() => []);
const cFinal = await rpc("waitlist_count", {});
ok("cleanup removed test rows (count back to baseline)", cFinal.body === base, `deleted=${Array.isArray(delBody) ? delBody.length : "?"}, count=${cFinal.body}`);

console.log(`\n— ${pass} passed, ${fail} failed —\n`);
process.exit(fail === 0 ? 0 : 1);
