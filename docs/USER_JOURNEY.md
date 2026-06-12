# PANIK — User Journey: Waitlist + Early-Access Payment

> Status: **Design / thinking doc** — decisions marked ⚠️ need sign-off before build.
> Last updated: 2026-06-12
> Companion to [`BACKEND_PLAN.md`](./BACKEND_PLAN.md). Where the two disagree, this doc wins for journey/flow; the backend plan wins for infra/security mechanics.

---

## 1. The core tension this doc resolves

Two features were designed around **two different identities**:

- The **waitlist** identifies a user by **email** (for magic-link beta access).
- The **$3 early-access escrow** identifies a user by **wallet** (the address that paid, and the address that can claim a refund).

A paying user has **both**. The journey only works if we link them at payment time and keep two sources of truth in sync:

| Source of truth | Owns | Never lies about |
| --------------- | ---- | ---------------- |
| **On-chain contract** (Base) | The money | Who paid, how much, the deadline, whether we shipped, who is owed a refund |
| **Supabase** | The CRM | email ↔ wallet link, onboarding answers (risk appetite, source), lifecycle status, who to email |

**Rule:** money questions are answered by reading the chain; everything else by Supabase. The browser is never the source of truth for either.

**Robustness payoff:** because refund eligibility lives on-chain and is tied to the wallet, a user can **always** reclaim their $3 by reconnecting the wallet that paid — even if we lose their email, the email bounced, or Supabase is down. Email is a *convenience reminder*, never the path to the money.

---

## 2. Two tiers, one modal

⚠️ **Decision 1 — keep a free tier alongside paid?** Recommended: **yes, but paid is the hero.**

| Tier | CTA | Pays | Gets | Identity |
| ---- | --- | ---- | ---- | -------- |
| **Early Access (paid)** | "Get Early Access — $3" (primary) | $3 USDC into escrow | First access when beta ships; full refund if we miss 90 days | Wallet (primary) + email (notices) |
| **Free waitlist** | "Just notify me" (secondary) | nothing | Notified after the paid cohort | Email only |

Why keep free: not everyone has USDC on Base ready, and a bigger email list is still valuable for marketing. Why make paid the hero: the refundable-escrow mechanic *is* the marketing — "we put our shipping promise on-chain" is a stronger trust signal than any copy.

The hero headline becomes the pitch:
> **Get early access for $3. If we don't ship in 90 days, the contract refunds you automatically.**

---

## 3. Entry points → which journey

```
                         Landing page
                              │
            ┌─────────────────┴─────────────────┐
   "Get Early Access — $3"              "Just notify me"
            │                                   │
      Journey A (paid)                   Journey B (free)
            │
   (later, time passes)
            │
   ┌────────┴────────┐
We shipped       We missed 90 days
   │                 │
Journey D        Journey C
(ship/release)   (refund claim)
```

---

## 4. Journey A — Paid early access (the hero path)

**Shared onboarding (same as free), then branch to payment.**

```
Step 1  Email                     → client regex precheck
Step 2  Risk appetite             → Conservative / Moderate / Aggressive (3 cards)
Step 3  Acquisition source        → existing searchable dropdown
Step 4  Review                    → confirm answers
        │
        ├─ POST /signup  ──────────► row created in Supabase
        │                            status = waitlist_free, position assigned,
        │                            Turnstile verified, email+onboarding saved
        │   (We persist the lead HERE, before payment, so a drop-off at the
        │    pay step is still captured as a free-tier lead.)
        ▼
Step 5  Pay $3
        5a  Connect wallet                  → wallet address known
        5b  Wrong network? → prompt switch to Base
        5c  No USDC? → inline help + onramp/bridge link
        5d  Approve + Pay  → ideally one tx via USDC permit (EIP-2612 gasless approve)
                              fallback: approve tx, then pay tx
        5e  Tx pending      → clear pending state; submit disabled (contract hasPaid also guards)
        5f  Tx confirmed    → client sends tx_hash to backend
        │
        ├─ POST /confirm-payment ──► Edge Function VERIFIES on-chain (reads receipt
        │                            / contract.hasPaid[wallet]) — never trusts the
        │                            client's word — then updates the row:
        │                            wallet_address, tx_hash, status = early_access_paid
        ▼
Step 6  Success
        - "You're in. Position #N."
        - "Your $3 is held in escrow. Refundable after <deadline date> if we don't ship."
        - Show contract address (Basescan link) + tx hash receipt.
        ▼
        Receipt email (Resend) — receipt + tx hash + deadline + "how refunds work"
```

**Why the lead is saved before payment, and why this is still secure:** the BACKEND_PLAN invariant is "no writes from the *browser*." Both writes here go through Edge Functions (service-role, server-side). The browser still has zero table access. `/confirm-payment` is the only thing that can flip a row to `early_access_paid`, and it does so only after independently confirming the payment on-chain. (This refines BACKEND_PLAN §4's "single insert at end" → "two server-side writes: lead, then verified payment.")

---

## 5. Journey B — Free waitlist

```
Step 1  Email
Step 2  Risk appetite
Step 3  Acquisition source
Step 4  Review → POST /signup → status = waitlist_free, position assigned
Step 5  Success → "You're on the list, position #N. Paid early-access users get in first —
                   upgrade anytime for $3." (gentle upsell)
        Confirmation email (deliverability check).
```

Identical to Journey A up to the branch. A free user can return later and pay to upgrade (re-open modal → "Upgrade to early access" → jumps to Step 5 payment using their existing email).

---

## 6. Journey C — Refund claim (we missed the deadline)

The novel, highest-trust, and easiest-to-get-wrong path. **$3 is small, so people will forget to claim** — the system must actively bring them back.

```
T+85d   Reminder email to all status = early_access_paid:
        "We didn't ship in time. Your $3 is claimable. [Claim refund]"
        (This is the #1 reason we collect email for paid users.)

T+90d   Deadline passes, contract not marked shipped → refunds become claimable.
        Landing page + app show a "Claim your refund" banner for connected paying wallets.

User    Return → Connect wallet → app reads contract:
        deadline passed && !shipped && hasPaid[wallet] && !refunded[wallet]
        → show "Claim $3" → claimRefund() tx → $3 returned → status = refunded
```

⚠️ **Decision 2 — unclaimed refunds after a long grace period?** Recommended: **claimable forever, no sweep.** A function that lets the team sweep unclaimed refunds would gut the trust mechanic. Leaving funds permanently claimable costs nothing and is maximally credible. (If a sweep is ever added, it should only be allowed years out and announced up front.)

**Hard-commitment property:** if the team misses the deadline, refunds open and the team can *never* release the funds afterward. Missing the deadline = forfeiting **all** escrow. That is the entire point — it makes the 90-day promise real. Do not add a grace extension.

---

## 7. Journey D — We shipped (release)

```
Before T+90d   Team calls release() from the multisig.
               ⚠️ Decision 3: 48h timelock on release() so the community can see it
               coming and challenge before funds move. Recommended: yes.
               → escrow funds go to the team treasury.

Notify         Email all paid users: "We shipped. Here's your access."
Access         Beta app: user connects wallet → Sign-In-With-Ethereum →
               app checks contract.hasPaid[wallet] == true → granted.
               status = shipped_active.
```

⚠️ **Decision 4 — beta auth method.** Recommended: **SIWE (wallet) primary for paid users**, since their paying wallet already *is* their identity and it's a DeFi app; **email magic link** for free-tier users and as a fallback. This avoids forcing paid users through a second, email-based identity.

⚠️ **Decision 5 — what "shipped" means + who holds the multisig.** The contract can only enforce *time*; "shipped" is a social judgement. Before launch, publicly define the shipped bar (e.g. "beta app live, paid users can log in and audit a real position") and publish the 2-of-3 Gnosis Safe signers. This is the trust backbone — needs your input, can't be defaulted.

---

## 8. User state machine

On-chain state is per-wallet (`hasPaid`, `refunded`) plus global (`shipped`, `deadline`). The user-facing status in Supabase is **derived** from combining chain + CRM:

```
visitor ──(email+onboarding)──► waitlist_free ──(pay $3, verified)──► early_access_paid
                                     │                                      │
                                     │                          ┌───────────┴───────────┐
                                     │                    release() called          deadline passed
                                     │                          │                  & not shipped
                                     │                          ▼                       ▼
                                     │                   shipped_active          refund_available
                                     │                          │                       │
                                     │                    (wallet login)          claimRefund()
                                     │                          │                       ▼
                                     └──(notify later)──────────┘                   refunded
```

| Status | In Supabase | On-chain truth | What the user sees |
| ------ | ----------- | -------------- | ------------------ |
| `waitlist_free` | row exists, no wallet | — | "On the list, #N" |
| `early_access_paid` | wallet + tx linked | `hasPaid = true` | "You're in, escrow held, refundable after <date>" |
| `shipped_active` | — | `shipped = true` | full beta access |
| `refund_available` | — | deadline passed, `!shipped`, `hasPaid`, `!refunded` | "Claim your $3" |
| `refunded` | — | `refunded = true` | "Refunded" |

---

## 9. UX safeguards & edge cases

| Risk | Handling |
| ---- | -------- |
| User has no USDC on Base | Inline "Need USDC on Base?" with bridge/onramp link; don't dead-end |
| User on wrong network | Detect chainId, prompt switch to Base before enabling Pay |
| No ETH for gas | Note tiny gas need (~cents); permit flow removes the approve gas |
| Two-tx approve+pay confusion | Prefer USDC **permit** (EIP-2612) → single pay tx, gasless approval |
| Double payment | `hasPaid[wallet]` reverts a second pay; UI disables Pay while pending |
| Tx rejected / failed | Clear error + retry; lead row already saved so nothing is lost |
| Email typo on a paid user | Refund still claimable via wallet — money path never depends on email; flag bounced receipts for follow-up |
| User pays from wallet A, signs up with email X | Link captured at `/confirm-payment` time (both present in session); store both |
| User forgets to claim refund | T+85 reminder email + persistent app banner; funds claimable forever |
| Team marks "shipped" but community disputes | 48h timelock + public shipped-definition + multisig; no on-chain veto in v1 (documented limitation) |
| Browser claims "I paid" without paying | `/confirm-payment` verifies on-chain; client claim alone never flips status |
| Indexing gap (we miss a payment event) | Periodic reconciliation job re-reads contract events → backfills Supabase |

---

## 10. Data model deltas (vs BACKEND_PLAN §3)

Add to `waitlist_signups`:

| Column | Type | Notes |
| ------ | ---- | ----- |
| `tier` | enum `free \| early_access` | which journey they completed |
| `tx_hash` | text nullable | payment tx; set only by `/confirm-payment` after on-chain verify |
| `paid_at` | timestamptz nullable | |
| `refund_reminded_at` | timestamptz nullable | so the T+85 mailer doesn't double-send |

`wallet_address` is now **verified** for paid users (it's the address that actually sent the tx), not a self-reported hint. `status` enum extends to the state machine in §8.

**New Edge Function:** `POST /confirm-payment` — input `{ email, wallet, tx_hash, turnstile }`; verifies the tx on a Base RPC against the known contract + amount, links wallet↔email, sets `tier = early_access`, `status = early_access_paid`. Idempotent on `tx_hash`.

---

## 11. Frontend deltas (vs BACKEND_PLAN §6)

- Hero: primary CTA → "Get Early Access — $3"; secondary → "Just notify me".
- `WaitlistModal`: after Review, branch — paid path adds the wallet/pay step (the existing wallet step becomes **real**, using wagmi/viem + the escrow contract), free path goes straight to success.
- Success screen for paid users shows escrow status, deadline, contract + tx links.
- New **Refund banner** component (landing + app) that appears when a connected wallet is in `refund_available`.
- Beta app login: SIWE for paid, magic link for free (per Decision 4).

---

## 12. Open decisions (need your call before build)

1. ⚠️ **Free tier + paid, or paid-only?** — recommend both, paid as hero. (§2)
2. ⚠️ **Unclaimed refunds: claimable forever vs eventual sweep?** — recommend forever. (§6)
3. ⚠️ **48h timelock on `release()`?** — recommend yes. (§7)
4. ⚠️ **Beta auth: SIWE vs magic link vs both?** — recommend SIWE for paid, magic link for free. (§7)
5. ⚠️ **Definition of "shipped" + multisig signers** — needs your input, can't default. (§7)
6. ⚠️ **Chain + token: Base + USDC?** — recommend confirm yes (matches Moonwell/Aave-on-Base focus). (§9)
7. ⚠️ **What free users get vs paid** — recommend: paid = first access; free = after the paid cohort. Make the value gap explicit in copy. (§2)
```
