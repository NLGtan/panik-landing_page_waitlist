/**
 * Add wallet(s) to the watch registry.
 * Usage: node --env-file=.env scripts/add-wallet.mjs 0xabc... [label]
 * (no args = add the predefined multi-protocol test wallets)
 */
import pg from "pg";

const DEFAULTS = [
  ["0x77819d746a876b523b0b41d942c1477f248f9137", "multi-protocol tester (Aave+Moonwell)"],
  ["0x93b0c5daa1518bb65c42eb25ce198b5231759647", "multi-protocol tester #2 (Aave+Moonwell)"],
];

const [, , argWallet, argLabel] = process.argv;
const wallets = argWallet ? [[argWallet.toLowerCase(), argLabel ?? null]] : DEFAULTS;

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

for (const [wallet, label] of wallets) {
  const r = await c.query(
    "insert into public.watched_wallets (wallet, risk_profile, label) values ($1, 'moderate', $2) on conflict (wallet) do nothing returning wallet",
    [wallet, label],
  );
  console.log(r.rowCount ? `added:   ${wallet}` : `exists:  ${wallet}`);
}

const all = await c.query(
  "select wallet, label from public.watched_wallets where is_active order by created_at",
);
console.log("\nwatch registry:");
for (const w of all.rows) console.log(`  ${w.wallet.slice(0, 10)}…  ${w.label ?? ""}`);
await c.end();
