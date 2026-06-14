-- ============================================================================
-- PANIK — Waitlist Registration schema v1 (2026-06-14)
-- Scope: FREE waitlist signup (email + format-checked wallet + 5 qualification
--        questions). LEAN design — no Edge Function, no third-party CAPTCHA.
--        Founding-User Escrow ($5 USDC / 90d) is a SEPARATE, later journey;
--        only `tier`/`status` are reserved here (payment columns added then).
--
-- ADDITIVE ONLY. Creates one table + helpers; touches NONE of the scoring
-- objects (watched_wallets, score_snapshots, watch_transitions,
-- price_baselines, onchain.lending_events). Idempotent — safe to re-run.
--
-- Write path (lean): the browser calls public.waitlist_signup() directly with
-- the publishable key. The table is deny-all RLS; the SECURITY DEFINER function
-- is the ONLY door (honeypot + insert + count()+1). Public count via
-- public.waitlist_count(). No Deno deploy, no service key in the loop.
--
-- Risk appetite is NOT stored — it is DERIVED on read from the raw answers
-- (public.waitlist_appetite() + the waitlist_enriched view), so the formula can
-- be tuned anytime with zero migration and no information is thrown away.
-- ============================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ── 1. waitlist_signups — the CRM row ───────────────────────────────────────
-- wallet_address is REQUIRED and format-checked (real EVM address, lowercased)
-- but UNVERIFIED for the free tier (verified only if it later deposits in the
-- escrow). All answers stored raw; appetite derived on read (§3).
create table if not exists public.waitlist_signups (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique,
  wallet_address     text not null
                     check (wallet_address = lower(wallet_address)
                            and wallet_address ~ '^0x[0-9a-f]{40}$'),

  -- Q1: DeFi activity level (single)
  q1_defi_activity   text not null
                     check (q1_defi_activity in
                            ('never','tried','active_1_2','active_3_plus')),
  -- Q2: liquidation experience / attitude (single)
  q2_liquidation     text not null
                     check (q2_liquidation in
                            ('no_unsure','no_managed','yes_caught','yes_accept')),
  -- Q3: how they track risk (multi — "select all")
  q3_risk_tracking   text[] not null default '{}'
                     check (q3_risk_tracking <@ array
                            ['manual_dashboard','portfolio_tracker',
                             'custom_alerts','protocol_alerts']::text[]),
  -- Q4: biggest frustration (multi — "pick up to two")
  q4_frustrations    text[] not null default '{}'
                     check (q4_frustrations <@ array
                            ['no_unified_view','slow_reaction',
                             'silent_risk','execution_friction']::text[]
                            and coalesce(array_length(q4_frustrations, 1), 0) <= 2),
  -- Q5: capital in active positions (single)
  q5_portfolio_size  text not null
                     check (q5_portfolio_size in
                            ('lt_1k','1k_10k','10k_50k','50k_200k','gt_200k')),

  additional_notes   text,

  -- Lifecycle (reserved values let the escrow journey reuse this row).
  tier               text not null default 'free'
                     check (tier in ('free','early_access')),
  status             text not null default 'waitlist_free'
                     check (status in ('waitlist_free','invited',
                                       'early_access_paid','shipped_active',
                                       'refund_available','refunded')),
  position           integer not null,

  created_at         timestamptz not null default now()
);

create index if not exists idx_waitlist_created
  on public.waitlist_signups (created_at desc);
create index if not exists idx_waitlist_wallet
  on public.waitlist_signups (wallet_address);

-- ── 2. RLS — deny-all default ───────────────────────────────────────────────
-- No table policies: publishable-key clients get nothing directly. Writes go
-- through waitlist_signup(); the public count through waitlist_count(). The
-- team reads/exports via the dashboard table editor (secret key, bypasses RLS).
alter table public.waitlist_signups enable row level security;

-- ── 3. Risk appetite — DERIVED on read, never stored ────────────────────────
-- Marketing/segmentation hint only; the product engine reads appetite solely
-- from the in-app user_profiles row. Tunable here without a migration.
-- Q2 (liquidation attitude) weighted 2×; score 4..12 → bands.
create or replace function public.waitlist_appetite(
  p_q1 text, p_q2 text, p_q5 text
) returns text
language sql immutable
as $$
  select case
    when (case p_q1 when 'never' then 1 when 'tried' then 1
                    when 'active_1_2' then 2 when 'active_3_plus' then 3 else 2 end)
       + (case p_q2 when 'no_unsure' then 1 when 'no_managed' then 2
                    when 'yes_caught' then 2 when 'yes_accept' then 3 else 2 end) * 2
       + (case p_q5 when 'lt_1k' then 1 when '1k_10k' then 1 when '10k_50k' then 2
                    when '50k_200k' then 3 when 'gt_200k' then 3 else 2 end)
       <= 6 then 'conservative'
    when (case p_q1 when 'never' then 1 when 'tried' then 1
                    when 'active_1_2' then 2 when 'active_3_plus' then 3 else 2 end)
       + (case p_q2 when 'no_unsure' then 1 when 'no_managed' then 2
                    when 'yes_caught' then 2 when 'yes_accept' then 3 else 2 end) * 2
       + (case p_q5 when 'lt_1k' then 1 when '1k_10k' then 1 when '10k_50k' then 2
                    when '50k_200k' then 3 when 'gt_200k' then 3 else 2 end)
       <= 9 then 'moderate'
    else 'aggressive'
  end;
$$;

-- Convenience view for analysis/export: every column + the derived appetite.
create or replace view public.waitlist_enriched as
  select s.*,
         public.waitlist_appetite(s.q1_defi_activity, s.q2_liquidation,
                                  s.q5_portfolio_size) as risk_appetite
    from public.waitlist_signups s;

-- SECURITY: a view runs with its OWNER's rights by default (security_invoker
-- off) and Supabase auto-grants anon SELECT on public views — so without this,
-- anon could read every row (emails!) THROUGH the view, bypassing the table's
-- deny-all RLS. security_invoker = on makes the base-table RLS apply to the
-- caller (anon → 0 rows; secret key → all rows). The revoke is belt-and-braces.
alter view public.waitlist_enriched set (security_invoker = on);
revoke all on public.waitlist_enriched from anon, authenticated;

-- ── 4. waitlist_signup — the one write path (browser-callable) ──────────────
-- SECURITY DEFINER so it can insert past deny-all RLS. Honeypot first (silent
-- success). Idempotent on email: a duplicate returns its existing position,
-- so the modal shows "you're on the list, #N" either way. Email is normalized
-- (lowercased + Gmail plus/dot collapse) before the unique check. Position is
-- count()+1 — good enough for a waitlist counter; cosmetic collisions under
-- concurrency are harmless.
create or replace function public.waitlist_signup(
  p_email            text,
  p_wallet           text,
  p_q1_defi_activity text,
  p_q2_liquidation   text,
  p_q3_risk_tracking text[],
  p_q4_frustrations  text[],
  p_q5_portfolio_size text,
  p_additional_notes text,
  p_honeypot         text default ''
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    citext;
  v_local    text;
  v_domain   text;
  v_position integer;
begin
  -- Honeypot: a real human leaves it empty. Don't tip off the bot.
  if coalesce(btrim(p_honeypot), '') <> '' then
    return 0;
  end if;

  -- Normalize email
  v_email  := lower(btrim(p_email));
  v_local  := split_part(v_email::text, '@', 1);
  v_domain := split_part(v_email::text, '@', 2);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(split_part(v_local, '+', 1), '.', '');
  else
    v_local := split_part(v_local, '+', 1);
  end if;
  v_email := (v_local || '@' || v_domain)::citext;

  -- Idempotent on email
  select position into v_position
    from public.waitlist_signups where email = v_email;
  if found then
    return v_position;
  end if;

  select count(*) + 1 into v_position from public.waitlist_signups;

  insert into public.waitlist_signups (
    email, wallet_address,
    q1_defi_activity, q2_liquidation, q3_risk_tracking, q4_frustrations,
    q5_portfolio_size, additional_notes, position
  ) values (
    v_email, lower(btrim(p_wallet)),
    p_q1_defi_activity, p_q2_liquidation,
    coalesce(p_q3_risk_tracking, '{}'), coalesce(p_q4_frustrations, '{}'),
    p_q5_portfolio_size, nullif(btrim(p_additional_notes), ''), v_position
  );

  return v_position;
end $$;

grant execute on function public.waitlist_signup(
  text, text, text, text, text[], text[], text, text, text
) to anon, authenticated;

-- ── 5. waitlist_count — public subscriber number ────────────────────────────
create or replace function public.waitlist_count()
returns bigint
language sql security definer set search_path = public stable
as $$ select count(*) from public.waitlist_signups; $$;

grant execute on function public.waitlist_count() to anon, authenticated;
