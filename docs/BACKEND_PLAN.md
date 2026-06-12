# PANIK Waitlist — Backend Implementation Plan

> Status: **Approved design** — not yet implemented.
> Last updated: 2026-06-12
> Scope: Waitlist signup backend, onboarding data capture, beta-tester list management, and magic-link beta access.

---

## 0. AI Implementation Prompt

Paste this prompt at the start of any AI-assisted session that implements or extends this plan:

```
You are a senior full-stack engineer and QA lead specializing in early-stage
SaaS launch infrastructure: Supabase (Postgres, RLS, Edge Functions, Auth),
transactional email (Resend), bot/abuse mitigation (Cloudflare Turnstile),
and React/TypeScript frontends. You are implementing the backend for PANIK,
a DeFi risk-intelligence product, per docs/BACKEND_PLAN.md in this repo.

Operating principles:
1. Security by construction, not convention. The browser must never hold a
   credential that can read or write the waitlist table. All writes go
   through the validated /signup Edge Function. RLS is deny-all for anon
   and authenticated roles on waitlist_signups.
2. Never trust client state. localStorage, form fields, and wallet
   addresses are unverified hints, never gates. The only access gate is
   Supabase Auth with shouldCreateUser: false.
3. Marketing data and product data stay structurally separated. The
   waitlist risk_appetite_signup column is immutable and is never read by
   product logic; the beta app's user_profiles table is the only
   engine-readable risk profile.
4. Fail loudly in the UI. Every network call in the signup modal needs an
   explicit error state with retry. Never show success before the server
   confirms the row exists.
5. Prevent email enumeration. The /signup endpoint returns an identical
   success-shaped response for new and duplicate emails.
6. QA before done. For every change, run the QA checklist in section 9 of
   the plan. A feature is not complete until its failure paths are tested
   (network loss mid-submit, double-click, duplicate email casing,
   plus-addressing, RLS probes from the browser console).
7. Match the existing codebase: React 19 + TypeScript + Vite + Tailwind v4
   + motion. Follow existing component style in src/components/.

When a decision is not covered by the plan, choose the option that
minimizes attack surface and operational burden, state the decision and
why, and update docs/BACKEND_PLAN.md so the plan stays the source of truth.
```

---

## 1. Product Requirements

1. **Signup with inline onboarding.** The existing multi-step `WaitlistModal` captures email, **risk appetite** (Conservative / Moderate / Aggressive), acquisition source, and an optional wallet address.
2. **Every signup is a beta tester.** Signups are stored durably with a lifecycle status (`pending → invited → active`).
3. **Retrievable tester list.** The team can view, filter (e.g. by risk appetite), and export the full list to send beta invites.
4. **Magic-link beta access.** Invited users log into the beta app via email magic link; uninvited users cannot log in at all.

---

## 2. Architecture Decision

**Supabase** (Postgres + RLS + Edge Functions + Auth) + **Resend** (email) + **Cloudflare Turnstile** (bot protection).

Why: one service covers storage, admin viewing/export (dashboard table editor + CSV), and magic-link auth that the beta app will reuse — so the waitlist and beta app share one user system with no migration. The site stays a static Vite deploy; zero servers to run. Lock-in risk is negligible (one table, exportable any time).

**Rejected alternatives:**
- Custom Express + SQLite — requires a server host, hand-rolled magic links, hand-rolled admin view. `express` is already in `package.json` but unused; it stays that way.
- Firebase — no SQL, weaker fit for the later beta app's relational needs.
- Google Sheets — no auth story.

---

## 3. Data Model

### `waitlist_signups` (created in Phase 1)

| Column                 | Type                                           | Notes                                                                                    |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                   | `uuid` PK                                      | `gen_random_uuid()`                                                                      |
| `email`                | `citext` **unique**                            | Normalized server-side before insert (see §5)                                            |
| `risk_appetite_signup` | enum `conservative \| moderate \| aggressive`  | **Immutable marketing data.** Written once; never updated; never read by product logic.  |
| `acquisition_source`   | `text`                                         | "Where did you hear about Panik?" answer                                                 |
| `wallet_address`       | `text` nullable                                | Self-reported, **unverified** — segmentation hint only                                   |
| `status`               | enum `pending \| invited \| active`            | Beta lifecycle                                                                           |
| `position`             | `int`                                          | Assigned transactionally as `COUNT(*) + 1` — **not** a Postgres sequence                 |
| `ip_hash`              | `text`                                         | Salted hash — rate limiting + forensic cleanup                                           |
| `user_agent`           | `text`                                         | Forensic cleanup                                                                         |
| `created_at`           | `timestamptz`                                  | `now()`                                                                                  |

**RLS: deny-all for `anon` and `authenticated`. Service role only.**
The browser cannot read or write this table under any circumstances.

### `user_profiles` (created in Phase 5, with the beta app)

| Column          | Type                     | Notes                                                                 |
| --------------- | ------------------------ | --------------------------------------------------------------------- |
| `auth_user_id`  | `uuid` PK → `auth.users` |                                                                       |
| `risk_appetite` | enum                     | Set **only** via in-app onboarding confirmation — never from waitlist |
| `onboarded_at`  | `timestamptz`            |                                                                       |

The Panik scoring engine reads risk appetite **exclusively** from `user_profiles`. In-app onboarding pre-fills the risk question from `risk_appetite_signup` for one-tap confirmation, but it requires an explicit confirmation before `user_profiles.risk_appetite` exists. A user who skips onboarding has no engine-readable risk profile — there is no fallback path to the marketing answer. This makes "the waitlist answer is only a hint" a constraint of the data model, not a convention.

---

## 4. Signup Flow

```
WaitlistModal steps:
  1. Email                     (client regex pre-check only)
  2. Risk appetite             (3 option cards: Conservative / Moderate / Aggressive)
  3. Acquisition source        (existing searchable dropdown)
  4. Review & confirm
  5. Wallet connect / manual / skip   (optional — data collected client-side)
  6. SUBMIT → POST /signup Edge Function → success screen or error + retry
```

**Key change from current code:** single insert at the very end of the flow (after the wallet step), not at the confirm step. This removes any need for an UPDATE path — the table is insert-only from the function's perspective — and fixes the original design conflict where the wallet was captured after the row already existed.

UI labels: "Aggressive" may be displayed with friendlier copy (e.g. "Degen" or "Growth") in the modal, but the stored enum value is always `aggressive`.

---

## 5. `/signup` Edge Function

The only write path to `waitlist_signups`. Holds the service-role key server-side. The anon key can only *invoke* the function. Processing order:

1. **Turnstile verification** — reject any request without a valid Cloudflare Turnstile token. Kills plain curl and scripted abuse.
2. **Server-side email normalization** — trim, lowercase, collapse Gmail plus-addressing (`user+tag@gmail.com` → `user@gmail.com`) before the unique check so dedupe cannot be bypassed by address variants.
3. **Server-side email format validation** — applied after normalization.
4. **Honeypot check** — a hidden field in the modal must be empty; silent reject if filled.
5. **IP rate limit** — reject more than N signups per `ip_hash` per hour (windowed count over existing rows).
6. **Transactional insert** — `position = COUNT(*) + 1` inside the transaction. Clean by construction; no gaps; spam cannot inflate positions because it cannot reach this step.
7. **Uniform response** — return identical body `{ ok: true, position }` whether the row was created or the email already existed. Prevents email enumeration; the modal shows "You're on the list" either way.
8. *(Optional Phase 4)* Trigger the confirmation email via Resend.

A companion read path (same function via GET, or a Postgres RPC) returns **only the total count** for the landing page subscriber number. The public "recent signups" social-proof feed stays **fully seeded/fake** — real emails, even masked, are never exposed to the browser.

---

## 6. Frontend Changes

Files touched: [`src/components/WaitlistModal.tsx`](../src/components/WaitlistModal.tsx), [`src/App.tsx`](../src/App.tsx), [`.env.example`](..\env.example).

- **Risk appetite step** added as step 2 (three large option cards, one-line description each). The existing `qIndex` state already supports multiple questions.
- **Turnstile widget** (invisible mode) embedded in the modal; token collected before submission.
- **Single submit at flow end** — all collected data posted in one request. No intermediate inserts.
- **Explicit error state with retry** — never advance to the success screen before the server returns `ok: true`. Disable the submit button while in-flight (prevents double-submit → exactly one row).
- **Subscriber count** comes from the backend read path. The visible social-proof feed remains seeded.
- **`localStorage`** keeps only the cosmetic `panik_has_subscribed` flag (suppresses re-showing the CTA). It gates nothing. "Already subscribed" truth comes from the uniform server response.
- **Env vars** (add to `.env.local`, update `.env.example`, remove unused `GEMINI_API_KEY`):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TURNSTILE_SITE_KEY`

---

## 7. Email (Resend)

- Configured as Supabase's **custom SMTP provider**. Supabase's built-in mailer is rate-limited to a few emails/hour — unusable for batch invites.
- **Requires a verified sending domain** with SPF and DKIM DNS records. A Gmail address cannot be the sender. **Do this in week one** — DNS propagation has lead time and it blocks everything downstream.
- **Signup confirmation email is required, not optional.** It is the deliverability check. The modal's client-side regex accepts typos (`name@gmial.com`); without a confirmation send, bad addresses surface on beta launch day. Include the waitlist position in the email for delight and reduce churn.

---

## 8. Beta Invites and Magic-Link Access

**Do not pre-generate magic links in batch.** Two known failure modes:
- Links expire (default 1 h, configurable max 24 h) — by the time people open a batch invite email, most links are dead.
- Corporate email scanners (Outlook SafeLinks, Proofpoint, etc.) prefetch URLs and consume one-time-use links before the human ever clicks.

**Correct flow:**

1. Invite script selects rows with `status = 'pending'`, **pre-creates Supabase Auth users** for them via `auth.admin.createUser`, sends a plain invite email (via Resend) with a normal link to the beta app's login page, and flips `status` to `'invited'`.
2. The beta app's login page collects the email and calls `signInWithOtp({ shouldCreateUser: false })` — a **fresh** magic link, generated on demand, only when the user is actually at the keyboard.
3. `shouldCreateUser: false` means **only pre-created (invited) emails can log in at all**. Uninvited visitors — including anyone with the beta URL or a spoofed client flag — get "no account found." The gate is the auth system itself; no client-side state is involved.
4. On first login, join the auth identity back to `waitlist_signups` by email, flip `status` to `'active'`, and begin in-app onboarding (pre-fills risk appetite from `risk_appetite_signup`, writes confirmed answer to `user_profiles.risk_appetite`).

**List retrieval and export:** Supabase dashboard table editor — filter (e.g. all `aggressive` signups before a date), one-click CSV export. No custom admin panel to build.

---

## 9. QA Checklist

Run this before calling any phase complete. A feature is not done until its failure paths pass.

- [ ] Duplicate email, different casing → one row; response identical to a fresh signup.
- [ ] `user+tag@gmail.com` and `user@gmail.com` → treated as the same address (normalization).
- [ ] Double-click the submit button → exactly one row inserted.
- [ ] Kill the network mid-submit → modal shows error + retry; **no success screen**; no `localStorage` flag set.
- [ ] RLS probe from the browser console with the anon key: SELECT returns zero rows; INSERT / UPDATE / DELETE all fail.
- [ ] Direct `POST /signup` via curl without a Turnstile token → rejected.
- [ ] More than N signups from one IP within the rate-limit window → rejected.
- [ ] Honeypot field filled → rejected (silent; no row created).
- [ ] Modal closed and reopened mid-flow → all state resets, including risk-appetite answer.
- [ ] Response body, status code, and response time are indistinguishable for new vs. duplicate emails (enumeration resistance).
- [ ] End-to-end invite test with a real **Outlook or corporate** address — that is where link-prefetch bugs surface, not Gmail.
- [ ] Uninvited email on the beta login page → cannot receive a magic link.
- [ ] Spam-row cleanup drill: identify rows by `ip_hash` and bulk-delete without disturbing positions of legitimate rows.

---

## 10. Build Phases

| Phase | Work                                                                                        | Estimate       | Blockers                              |
| ----- | ------------------------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| 1     | Supabase project, schema, deny-all RLS                                                      | ~2 h           | Supabase account                      |
| 2     | `/signup` Edge Function: Turnstile + normalization + honeypot + rate limit + transactional position + uniform response | ~½ day | Phase 1; Cloudflare Turnstile site key |
| 3     | Frontend: risk-appetite step, Turnstile widget, submit-at-end, error/retry UI, real count   | ~½ day         | Phase 2 for full E2E (UI can start independently) |
| 4     | Resend domain verification (SPF/DKIM) + signup confirmation email                          | small + DNS lead time | **Start week one** — propagation delay |
| 5     | Invite script + `shouldCreateUser: false` login gate + `user_profiles` table                | —              | Beta app exists (redirect URL needed) |

---

## 11. Resolved Design Gaps

These were identified in review and are fixed by construction above. Do not regress them.

| # | Gap | Fix |
| - | --- | --- |
| 1 | Spam inserts via anon key | No anon table access. All writes go through the Edge Function (Turnstile + honeypot + IP rate limit). Position computed transactionally from clean rows. §3, §5 |
| 2 | Risk-appetite drift | Immutable `risk_appetite_signup` (marketing) structurally separated from `user_profiles.risk_appetite` (product). Engine reads only the latter; no fallback path. §3 |
| 3 | Spoofable `localStorage` | Server is source of truth via uniform response. Beta access gated by Auth `shouldCreateUser: false`, never client state. §5, §8 |
| 4 | Batch magic-link expiry / scanner prefetch | Invite email carries a plain link. Magic link generated on demand at the login page. §8 |
| 5 | Wallet captured after insert vs. INSERT-only RLS | Single insert at end of flow. No UPDATE path exists. §4 |
| 6 | Masked public feed privacy risk | Feed stays fully seeded/fake. Only the count is real. §5 |
| 7 | Email typos burning invites | Signup confirmation email is mandatory. §7 |
