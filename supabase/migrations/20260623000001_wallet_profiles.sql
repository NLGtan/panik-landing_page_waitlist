-- ============================================================================
-- PANIK — Wallet DeFi-Persona Profiler cache (2026-06-23)
-- Scope: persistent cache for /api/profile (serverless can't use in-memory).
-- See docs/technical-docs/WALLET_PROFILER.md.
--
-- Access model:
--   * Vercel function / dev API → secret key or direct pg (bypass RLS).
--   * Frontend → no direct access; it reads profiles through /api/profile,
--     so RLS stays deny-all (consistent with the scoring-engine tables).
-- Paste into Supabase SQL Editor (idempotent — safe to re-run).
-- ============================================================================

-- One row per profiled wallet. `result` holds the full deterministic
-- classification (profile, archetype, riskAppetiteIndex, confidence,
-- reasons, and the WalletFeatures vector) as produced by classifyWallet.
-- The AI narration is NOT cached here: it depends on the user's quiz answers
-- (stated profile), is sub-cent, and is regenerated per reveal.
create table if not exists public.wallet_profiles (
  wallet      text primary key
              check (wallet = lower(wallet) and wallet ~ '^0x[0-9a-f]{40}$'),
  result      jsonb not null,
  computed_at timestamptz not null default now()
);

-- Staleness scans (recompute wallets older than the TTL).
create index if not exists idx_wallet_profiles_computed_at
  on public.wallet_profiles (computed_at);

alter table public.wallet_profiles enable row level security;
-- No policies on purpose: deny-all to publishable-key clients. The profiler
-- function uses the secret key / direct pg and bypasses RLS.
