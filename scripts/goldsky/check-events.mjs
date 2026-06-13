/** Quick look at what the Mirror pipeline has landed in onchain.lending_events. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const counts = await c.query(
  "select protocol, event_name, count(*) as n from onchain.lending_events group by 1,2 order by 1,2",
);
const latest = await c.query(
  "select protocol, event_name, user_address, block_time, tx_hash from onchain.lending_events order by block_number desc limit 5",
);
const total = await c.query("select count(*) as n, max(block_time) as newest from onchain.lending_events");

console.log(`total events: ${total.rows[0].n}  (newest: ${total.rows[0].newest ?? "—"})\n`);
for (const r of counts.rows) console.log(`  ${r.protocol.padEnd(12)} ${r.event_name?.padEnd(16) ?? "(null)"} ${r.n}`);
if (latest.rows.length) {
  console.log("\nlatest:");
  for (const r of latest.rows)
    console.log(`  ${String(r.block_time).slice(0, 19)}  ${r.protocol.padEnd(12)} ${(r.event_name ?? "?").padEnd(16)} ${r.user_address?.slice(0, 12) ?? "—"}…  ${r.tx_hash.slice(0, 14)}…`);
}
await c.end();
