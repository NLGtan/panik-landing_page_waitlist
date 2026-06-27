-- ============================================================================
-- PANIK - Tighten lending_events retention (2026-06-27)
-- Why: onchain.lending_events (the Goldsky Mirror firehose) grew to ~524 MB and
--      blew the Supabase free-tier 0.5 GB cap. Nothing live reads it yet (it is
--      the future Advisor "what happened" feed); the 180-day window was far too
--      long for a continuous all-protocol Base firehose on the free tier.
--
-- This migration ONLY reschedules the retention cron (180d -> 7d on
-- lending_events; snapshots stay 90d). Idempotent and safe to re-run.
--
-- The one-time space reclaim (TRUNCATE onchain.lending_events) is NOT in this
-- file on purpose - a re-runnable migration must never wipe data. Run it once,
-- by hand, in the SQL editor, and pause the `panik-lending-events` Goldsky
-- pipeline so it stops refilling. See docs/technical-docs/TELEGRAM_ALERTS.md /
-- SYSTEM_ARCHITECTURE.md.
-- ============================================================================

create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('panik_retention'); exception when others then null; end $$;
select cron.schedule(
  'panik_retention',
  '17 3 * * *',  -- daily 03:17 UTC
  $$
    delete from public.score_snapshots  where created_at < now() - interval '90 days';
    delete from onchain.lending_events  where block_time < now() - interval '7 days';
  $$
);
