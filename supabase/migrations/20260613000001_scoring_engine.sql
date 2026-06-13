-- ============================================================================
-- PANIK — Risk Scoring Engine schema v1 (2026-06-13)
-- Scope: Watch worker state + Goldsky Mirror event sink. Waitlist PARKED.
-- Paste into Supabase SQL Editor (idempotent — safe to re-run).
--
-- Access model:
--   * Watch worker / Mirror pipeline → secret key or direct pg (bypass RLS)
--   * Frontend → NO access yet: RLS enabled with zero policies = deny-all.
--     SIWE-scoped read policies land with the UI wiring (Slice 2).
-- ============================================================================

-- ── 0. Helpers ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── 1. watched_wallets — the Watch registry ────────────────────────────────
-- One row per monitored wallet. risk_profile drives the alert thresholds
-- (conservative 25 / moderate 50 / aggressive 75 — arch §Risk Profiles).
create table if not exists public.watched_wallets (
  id           uuid primary key default gen_random_uuid(),
  wallet       text not null unique
               check (wallet = lower(wallet) and wallet ~ '^0x[0-9a-f]{40}$'),
  risk_profile text not null default 'moderate'
               check (risk_profile in ('conservative','moderate','aggressive')),
  label        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_watched_wallets_updated on public.watched_wallets;
create trigger trg_watched_wallets_updated
  before update on public.watched_wallets
  for each row execute function public.set_updated_at();

-- ── 2. score_snapshots — score time series ─────────────────────────────────
-- Worker writes on CHANGE plus a 15-min heartbeat (NOT every 60s tick —
-- 10 wallets × 1440 ticks/day would eat the free tier for no signal).
create table if not exists public.score_snapshots (
  id                  bigint generated always as identity primary key,
  wallet              text not null,
  protocol            text not null check (protocol in ('aave_v3','moonwell','morpho','compound_v3')),
  total               smallint not null check (total between 0 and 100),
  band                text not null check (band in ('LOW','ELEVATED','HIGH','CRITICAL')),
  sub_scores          jsonb not null,  -- {positionHealth, assetRisk, protocolSafety, systemicRisk}
  health_factor       numeric,         -- null = no debt (Aave uint256.max sentinel)
  current_ltv         numeric,
  collateral_usd      numeric,
  borrow_usd          numeric,
  collateral_symbol   text,
  asset_risk_is_proxy boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists idx_snapshots_wallet_proto_time
  on public.score_snapshots (wallet, protocol, created_at desc);

-- ── 3. watch_transitions — profile-relative status changes ─────────────────
-- Sparse: only when within/approaching/outside changes (WatchService events).
-- This is the alert log AND the Advisor's trigger feed.
create table if not exists public.watch_transitions (
  id             bigint generated always as identity primary key,
  wallet         text not null,
  protocol       text not null check (protocol in ('aave_v3','moonwell','morpho','compound_v3')),
  risk_profile   text not null
                 check (risk_profile in ('conservative','moderate','aggressive')),
  score          smallint not null check (score between 0 and 100),
  band           text not null check (band in ('LOW','ELEVATED','HIGH','CRITICAL')),
  from_status    text check (from_status in ('within','approaching','outside')), -- null = first observation
  to_status      text not null check (to_status in ('within','approaching','outside')),
  notified_at    timestamptz,   -- null until the alert channel confirms send
  notify_channel text,          -- 'telegram' | 'email' | … (Phase-0 decision pending)
  created_at     timestamptz not null default now()
);

create index if not exists idx_transitions_wallet_time
  on public.watch_transitions (wallet, created_at desc);
-- Pending-notification queue scan:
create index if not exists idx_transitions_unnotified
  on public.watch_transitions (created_at)
  where notified_at is null;

-- ── 4. price_baselines — PriceWatcher persistence ──────────────────────────
-- Chainlink movement baselines must survive worker restarts, otherwise a
-- restart during a crash silently swallows the ≥2% trigger.
create table if not exists public.price_baselines (
  symbol          text primary key,        -- 'ETH' | 'USDC' | 'cbETH' | 'BTC'
  price           numeric not null,
  feed_updated_at timestamptz,
  is_stale        boolean not null default false,
  observed_at     timestamptz not null default now()
);

-- ── 5. RLS — deny-all default ───────────────────────────────────────────────
alter table public.watched_wallets   enable row level security;
alter table public.score_snapshots   enable row level security;
alter table public.watch_transitions enable row level security;
alter table public.price_baselines   enable row level security;
-- No policies on purpose: publishable-key clients get nothing until the
-- SIWE-scoped policies ship. Worker uses secret key / direct pg (bypasses RLS).

-- ── 6. onchain schema — Goldsky Mirror sink ────────────────────────────────
-- Mirror AUTO-CREATES its raw tables here (one per dataset) when the
-- pipeline first runs; do not pre-create those. The curated table below is
-- the TRANSFORMED single-table option (pipeline transform → one normalized
-- event stream), which is what the Advisor's "What happened" feed reads.
create schema if not exists onchain;

create table if not exists onchain.lending_events (
  id              text primary key,        -- Goldsky stable event id (re-org-safe upsert key)
  protocol        text not null,           -- aave_v3 | moonwell | morpho | compound_v3
  event_name      text not null,           -- Borrow|Repay|Supply|Withdraw|LiquidationCall
  user_address    text,
  related_address text,                    -- onBehalfOf / liquidator
  asset_address   text,
  asset_symbol    text,
  amount_raw      numeric,
  amount_usd      numeric,
  tx_hash         text not null,
  log_index       integer,
  block_number    bigint not null,
  block_time      timestamptz not null,
  -- Raw log payload retained so user/amount extraction can be re-derived
  -- offline (the Mirror transform's per-event topic positions are v1).
  topics          text,
  data            text
);

create index if not exists idx_lending_events_user_time
  on onchain.lending_events (user_address, block_time desc);
create index if not exists idx_lending_events_proto_event_time
  on onchain.lending_events (protocol, event_name, block_time desc);

alter table onchain.lending_events enable row level security;

-- NOTE: the `onchain` schema is NOT exposed over Supabase REST (only
-- `public` is, by default). The worker reads it via the direct pg
-- connection — intentional: raw event firehose stays off the public API.

-- ── 7. Retention — keep the free tier alive ────────────────────────────────
-- 90d on snapshots, 180d on raw events. If pg_cron isn't enabled yet:
-- Dashboard → Database → Extensions → enable pg_cron, then re-run §7 only.
create extension if not exists pg_cron;

do $$ begin perform cron.unschedule('panik_retention'); exception when others then null; end $$;
select cron.schedule(
  'panik_retention',
  '17 3 * * *',  -- daily 03:17 UTC
  $$
    delete from public.score_snapshots  where created_at < now() - interval '90 days';
    delete from onchain.lending_events  where block_time < now() - interval '180 days';
  $$
);

-- ── 8. Seed — the live-validation cohort ───────────────────────────────────
-- Real Base borrowers already scored successfully via `npm run demo:watch`
-- (Dune 7710543/7710559). Gives the worker real positions on day one.
insert into public.watched_wallets (wallet, risk_profile, label) values
  ('0x12a58e699baf4b230f571df90523fe9ac3e42305', 'moderate', 'validation: Aave WETH borrower'),
  ('0x292d023c84885873c8da11792db9b30318f8acf8', 'moderate', 'validation: Aave cbBTC borrower'),
  ('0x416ec2ca21a38cbcfeacd6a14532b3f348356d23', 'moderate', 'validation: Moonwell AERO whale'),
  ('0x76f88702325c92c83efad341a932fb326957056f', 'moderate', 'validation: Moonwell HF~1.2 (alerts)')
on conflict (wallet) do nothing;
