# Referral Program — Design (2026-07-19)

Approved direction (Ivan, 2026-07-19): pay $0.25 per qualified referral to the
referrer; referee gets a one-time in-game bonus. Qualification = 10 onchain
transactions made through the game. Sybil wallets are acceptable as long as
their transactions are real in-app activity (the goal is Base App metrics:
Daily Transacting Users / Number of Transactions), but explorer-only contract
interactions must NOT count.

## Goals

- Growth loop native to Base App: cast with embed → open → play → transact.
- Every paid referral represents at least 10 real transactions through the
  game's contracts (check-in, score claim, NFT mint; spin when it goes
  onchain).
- Zero new trust in the client for money decisions: every counted transaction
  is verified onchain from the receipt; every payout is manually reviewed.

## Non-goals

- Perfect human-uniqueness of referees (explicitly waived by Ivan; alt
  wallets still produce real transactions, which is what the program buys).
- Instant/automatic USDC payouts (v1 is a manual weekly batch).
- Detecting which Farcaster client hosts the mini app (Base App vs other
  clients cannot be distinguished reliably; both are legitimate players).

## Definitions

- Referrer: existing player who shares their code.
- Referee: wallet that opens the app through `?ref=CODE` and binds.
- New wallet: address with no `scores` zset entry and no `economy_checkin`
  record at bind time.
- Game transaction: successful onchain tx whose receipt contains a log from a
  whitelisted game contract with the referee's address in an indexed topic.

## Parameters (constants, tunable without redesign)

| Parameter | Value |
|---|---|
| Reward per qualified referral | $0.25 (USDC) |
| Qualification threshold | 10 game transactions |
| Payout minimum | $1.00 (4 qualified referrals) |
| Payout cadence | weekly, manual batch |
| Per-referrer paid cap | 20 qualified referrals ($5); raiseable per wallet |
| Pilot budget (hard cap) | $100 = 400 qualified referrals |
| Referee bonus | 100 coins + 1 magnet booster charge, once, at bind |
| Kill switch | `REFERRAL_ENABLED` env; unset/`0` = bind/count/qualify all paused |

Contract whitelist: `CHECKIN_ADDRESS` (0xEc5D…D763), `SCORECLAIM_ADDRESS`
(0x2874…B7e2), `NFT_CONTRACT` (env), `SPIN_ADDRESS` (0xeFE3…5985, dormant
until spin goes onchain).

## Attribution flow (Base App)

1. Referrer's Invite screen shows their code and a share button.
   - Code: 8 chars derived from `keccak(address + REFERRAL_CODE_SALT)`,
     stored `referral_code:{code} -> address` on first request (idempotent).
     The code does not reveal the wallet.
   - Share: `composeCast` with prefilled text + embed
     `https://baserunnerapp.vercel.app/?ref=CODE` (OnchainKit MiniKit hook;
     fallback: copy link). A cast embed opens directly as the mini app with
     query preserved.
2. On app load, the client reads `?ref=` and stores it in localStorage
   immediately (wallet is not connected yet at that point).
3. When the wallet bridge delivers an address, the client calls
   `POST /api/referral/bind { code, address }` once.
4. Server-side bind rules, all enforced atomically:
   - program enabled; code resolves to a referrer address;
   - referrer != referee;
   - referee is a NEW wallet (no `scores` member, no `economy_checkin` key);
   - `SET NX referral_bound:{referee} -> {referrer, boundAt}` — first touch
     wins, binding is permanent, re-binding/re-attribution is impossible.
5. On successful bind: grant referee bonus (see below), add referee to
   `referral_children:{referrer}` set.

Failed binds are silent no-ops for UX (the app just works without the bonus).

## Transaction counting

### Client: one generic reporter

`reportGameTx(txHash)` — a small helper called from the success paths of
`useCheckIn`, `useScoreClaim`, `useNftMint` (and any future tx hook).

- Paymaster path (`wallet_sendCalls`): the real `transactionHash` is taken
  from `wallet_getCallsStatus` receipts once status is CONFIRMED (the hooks
  already poll this).
- Fallback path (`writeContract`): the hash from `onSuccess` after the
  receipt confirms.
- Fire-and-forget POST to `/api/referral/tx { address, txHash }`; failures
  never affect gameplay.

### Server: `POST /api/referral/tx`

1. Program enabled; `referral_bound:{address}` exists and its status is
   `pending` — otherwise 200 no-op (cheap early exit).
2. Dedupe: `SET NX referral_txseen:{txHash}` (TTL 90d); duplicate = no-op.
3. Verify via the existing viem public client:
   - `getTransactionReceipt(txHash)`, status must be `success`;
   - at least one log where `log.address` is in the contract whitelist AND
     one of the indexed topics equals the referee address (left-padded).
   This is 4337-safe: with Base App smart wallets + paymaster, receipt
   `from`/`to` are bundler/EntryPoint, but event topics still carry the
   player (`ScoreClaimed(player)`, check-in event user, ERC-1155
   `TransferSingle` `to`).
4. `INCR referral_tx:{address}`; if the count reaches the threshold, mark
   qualification eagerly (same logic as the cron phase) so the UI updates
   without waiting a day.

Explorer-made transactions never enter this pipeline (nothing reports them).
A hand-crafted curl can only submit hashes of real, successful transactions
of the caller's own bound wallet against game contracts — which is exactly
the activity being paid for; junk and third-party hashes fail verification.

### Check-ins and server-side actions

Check-in already produces an onchain tx through the app, so it flows through
the same reporter. The referral counter deliberately ignores
`economy_checkin.total` (it can absorb chain state made outside the app via
the `Math.max(total, chainTotal)` reconciliation in the claim route).

## Qualification and accrual

- Daily cron (existing `/api/notify/cron` gets a referral phase, or a
  sibling route on the same schedule) scans `pending` binds:
  `referral_tx:{referee} >= 10` → status `qualified`.
- On qualification (eager or cron):
  - `INCRBY referral_balance:{referrer} 25` (cents), unless the referrer is
    at the per-referrer cap or the global budget counter is exhausted —
    those qualify as `qualified_unpaid` (visible, not payable) so the rules
    stay honest in the UI.
  - `INCR referral_budget_used` (cents) against the pilot pool.
  - Push notification to the referrer (existing notification infra):
    "Your friend hit 10 transactions — you earned $0.25."

## Payouts (manual weekly batch)

- Referrers with `referral_balance >= 100` cents appear in an admin list:
  `GET /api/referral/admin` (auth: `NOTIFY_ADMIN_SECRET` header), returning
  address, balance, qualified children and their tx counts.
- Ivan reviews and sends USDC on Base from a dedicated program wallet that
  holds only the pilot budget (never the main wallet). v1 sending is a local
  script (viem, USDC `transfer` loop) run manually; each payout is recorded
  back via `POST /api/referral/admin { address, txHash, amountCents }`,
  which decrements the balance and stores the payout record.
- UI copy must say: payouts are weekly; fraudulent referrals can be voided.

## Referee bonus

Granted server-side exactly once at bind: +100 coins to the server coin
balance and +1 magnet booster charge (`referral_bonus:{referee}` SET NX
guard).
Values sit between the rare and legendary crate coin rewards, one-time, so
they cannot destabilize the economy. No USDC ever goes to referees.

## Client UI (placement approved 2026-07-19)

- Entry point: compact "Invite & Earn — $0.25 per friend" banner on the main
  menu, directly under the Daily Spin / Daily Check-in banners row, styled
  with the existing `spin-banner` pattern. Hidden when the program is
  disabled or the budget pool is exhausted (same show/hide pattern as the
  starter-pack banner).
- Dedicated screen `screen-referral` (non-hub overlay, like spin/check-in):
  "← HOME" heading, eyebrow "Referral program", title INVITE, status chip
  with the current balance. Contents: personal code, share button
  (composeCast with the ?ref link; fallback copy), list of invited wallets
  with progress "7/10 tx" and status chips (pending/qualified/paid), payout
  terms line ("paid weekly from $1").
- Bridge row in Profile ("Referrals: 3 invited · $0.75") opening the same
  screen. No fifth tab in the bottom nav (4 tabs + PLAY stays as is).
- `GET /api/referral/status?address=` powers the screen: code, children with
  tx counts and statuses, balance, program-active flag.

## Redis schema

```
referral_code:{code}        -> referrer address            (no TTL)
referral_bound:{referee}    -> {referrer, boundAt, status} (no TTL)
referral_children:{referrer}-> SET of referee addresses    (no TTL)
referral_tx:{referee}       -> int                         (no TTL)
referral_txseen:{txHash}    -> 1                           (TTL 90d)
referral_balance:{referrer} -> int cents                   (no TTL)
referral_budget_used        -> int cents                   (no TTL)
referral_payout:{referrer}  -> LIST of {txHash, cents, ts} (no TTL)
referral_bonus:{referee}    -> 1                           (no TTL)
```

Status values on `referral_bound`: `pending` → `qualified` (→ implicit
`paid` via balance/payout records) or `qualified_unpaid` (cap/budget hit).

## Env vars

- `REFERRAL_ENABLED` — kill switch (`1` to enable).
- `REFERRAL_CODE_SALT` — server-side salt for code derivation.
- Existing: `NOTIFY_ADMIN_SECRET` (admin routes), RPC via existing public
  client config, `NEXT_PUBLIC_APP_URL` (share links).

## Edge cases

- Referee already had the app but never transacted/scored: passes the "new
  wallet" check — acceptable (they were invisible to the economy anyway).
- Two devices race to bind different codes: `SET NX` — first write wins.
- Referrer invites themselves (same wallet): rejected (`referrer != referee`).
- Budget exhausted mid-flight: binds continue (funnel data), qualification
  marks `qualified_unpaid`, Invite screen shows "program paused".
- Program disabled: all referral routes return `{active: false}`; UI hides
  the money messaging.
- Payout wallet compromise: it holds ≤ remaining pilot budget by policy.

## Rollout

1. Ship server routes + counting behind `REFERRAL_ENABLED=0` (dark).
2. Ship Invite UI hidden behind the same flag; verify bind/count/qualify on
   a preview deploy with test wallets.
3. Fund program wallet with $100. Flip `REFERRAL_ENABLED=1`.
4. Announce via existing notification broadcast to the 78 engaged players
   first (they have the most reach and the least fraud incentive).
5. Watch the first week: budget counter, per-referrer distributions, tx
   patterns of referees; run first payout batch manually.

## Out of scope (v1)

- Onchain claim of referral rewards (signed-voucher contract) — possible
  later reusing the NFT-sign pattern.
- Automatic payouts, referee-side USDC, multi-level referrals ("invite the
  inviter"), seasonal referral leaderboards.
