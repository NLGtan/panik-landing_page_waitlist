import pg from "pg";

const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function cleanup() {
  const t = await db.query(
    "DELETE FROM public.watch_transitions WHERE id IN (18, 19, 20)"
  );
  console.log(`Deleted ${t.rowCount} test transitions`);

  const s = await db.query(
    `DELETE FROM public.score_snapshots
     WHERE wallet = '0x1d431b6b03ee0346df18aa5c30731a5447369af0'
       AND protocol = 'moonwell'
       AND total = 72
       AND health_factor = 1.12`
  );
  console.log(`Deleted ${s.rowCount} test snapshots`);

  await db.end();
  console.log("✓ Cleanup done");
}

cleanup().catch(console.error);
