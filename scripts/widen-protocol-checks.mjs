/**
 * Widen protocol CHECK constraints for the 4-protocol engine
 * (aave_v3, moonwell, morpho, compound_v3). Idempotent.
 * Run: node --env-file=.env scripts/widen-protocol-checks.mjs
 */
import pg from "pg";

const PROTOCOLS = "('aave_v3','moonwell','morpho','compound_v3')";
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

for (const table of ["score_snapshots", "watch_transitions"]) {
  await c.query(`alter table public.${table} drop constraint if exists ${table}_protocol_check`);
  await c.query(
    `alter table public.${table} add constraint ${table}_protocol_check check (protocol in ${PROTOCOLS})`,
  );
  console.log(`widened: public.${table}.protocol → 4 protocols`);
}

const verify = await c.query(`
  select conrelid::regclass as t, pg_get_constraintdef(oid) as def
  from pg_constraint where conname like '%_protocol_check'
`);
for (const r of verify.rows) console.log(`  ${r.t}: ${r.def}`);
await c.end();
