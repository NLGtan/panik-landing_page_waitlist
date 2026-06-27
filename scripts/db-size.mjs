/**
 * PANIK - Supabase DB size probe (read-only). Run: node --env-file=.env scripts/db-size.mjs
 * Reports total DB size + the biggest tables (heap + indexes + toast) and dead-tuple bloat,
 * so we can see what is pushing the free-plan 0.5 GB cap.
 */

import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL missing");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const { rows: db } = await client.query(
    `select pg_size_pretty(pg_database_size(current_database())) as size`,
  );
  console.log(`\nTotal database size: ${db[0].size}\n`);

  const { rows } = await client.query(`
    select n.nspname as schema, c.relname as tbl,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total,
           pg_size_pretty(pg_relation_size(c.oid)) as heap,
           pg_size_pretty(pg_indexes_size(c.oid)) as idx,
           c.reltuples::bigint as approx_rows,
           coalesce(s.n_dead_tup, 0) as dead_tup
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_all_tables s on s.relid = c.oid
     where c.relkind = 'r' and n.nspname not in ('pg_catalog','information_schema')
     order by pg_total_relation_size(c.oid) desc
     limit 20
  `);

  console.log("schema.table".padEnd(34), "total".padEnd(10), "heap".padEnd(10), "idx".padEnd(10), "rows".padEnd(12), "dead");
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      `${r.schema}.${r.tbl}`.padEnd(34),
      String(r.total).padEnd(10),
      String(r.heap).padEnd(10),
      String(r.idx).padEnd(10),
      String(r.approx_rows).padEnd(12),
      String(r.dead_tup),
    );
  }
} catch (err) {
  console.error(`probe failed: ${err.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
