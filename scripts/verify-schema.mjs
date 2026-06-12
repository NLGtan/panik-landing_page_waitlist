/**
 * PANIK — Supabase schema verification (scoring engine migration).
 * Run:  npm run db:verify
 * Connects exactly like the Watch worker will (SUPABASE_DB_URL, session
 * pooler) and checks tables, RLS, indexes, the retention cron, and seeds.
 */

import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL missing — run via: npm run db:verify");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }, // Supabase requires TLS; pooler cert chain
});

const results = [];
const expect = (name, ok, detail) => results.push({ name, ok, detail });

try {
  await client.connect();

  // 1. Tables exist
  const { rows: tables } = await client.query(`
    select table_schema || '.' || table_name as t
    from information_schema.tables
    where (table_schema = 'public' and table_name in
            ('watched_wallets','score_snapshots','watch_transitions','price_baselines'))
       or (table_schema = 'onchain' and table_name = 'lending_events')
  `);
  const found = tables.map((r) => r.t).sort();
  expect("5 tables created", found.length === 5, found.join(", "));

  // 2. RLS enabled on all five
  const { rows: rls } = await client.query(`
    select n.nspname || '.' || c.relname as t, c.relrowsecurity as on
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public' and c.relname in
            ('watched_wallets','score_snapshots','watch_transitions','price_baselines'))
       or (n.nspname = 'onchain' and c.relname = 'lending_events')
  `);
  const rlsOff = rls.filter((r) => !r.on).map((r) => r.t);
  expect("RLS enabled (deny-all)", rlsOff.length === 0, rlsOff.length ? `OFF on: ${rlsOff}` : "all 5 locked");

  // 3. updated_at trigger
  const { rows: trig } = await client.query(`
    select tgname from pg_trigger
    where tgname = 'trg_watched_wallets_updated' and not tgisinternal
  `);
  expect("updated_at trigger", trig.length === 1, trig[0]?.tgname ?? "MISSING");

  // 4. Indexes (the partial unnotified-queue index is the one worth proving)
  const { rows: idx } = await client.query(`
    select indexname from pg_indexes
    where indexname in ('idx_snapshots_wallet_proto_time','idx_transitions_wallet_time',
                        'idx_transitions_unnotified','idx_lending_events_user_time',
                        'idx_lending_events_proto_event_time')
  `);
  expect("5 indexes", idx.length === 5, `${idx.length}/5 present`);

  // 5. Retention cron job
  const { rows: cron } = await client.query(`
    select jobname, schedule, active from cron.job where jobname = 'panik_retention'
  `);
  expect(
    "pg_cron retention job",
    cron.length === 1 && cron[0].active,
    cron[0] ? `'${cron[0].jobname}' @ '${cron[0].schedule}' active=${cron[0].active}` : "MISSING",
  );

  // 6. Seed rows
  const { rows: seeds } = await client.query(
    `select wallet, risk_profile, label from public.watched_wallets order by created_at`,
  );
  expect("validation cohort seeded", seeds.length >= 4, `${seeds.length} wallets`);
  for (const s of seeds) console.log(`   seed: ${s.wallet.slice(0, 10)}…  ${s.risk_profile}  ${s.label}`);

  // 7. Write-path sanity: worker can upsert a price baseline (then clean up)
  await client.query(`
    insert into public.price_baselines (symbol, price) values ('__VERIFY__', 1)
    on conflict (symbol) do update set price = 1, observed_at = now()
  `);
  await client.query(`delete from public.price_baselines where symbol = '__VERIFY__'`);
  expect("worker write path", true, "insert/upsert/delete OK over session pooler");
} catch (err) {
  expect("connection/query", false, err.message);
} finally {
  await client.end().catch(() => {});
}

console.log("\nSchema verification\n" + "─".repeat(64));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(28)} ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log("─".repeat(64));
console.log(failed === 0 ? "Schema is live and worker-ready." : `${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
