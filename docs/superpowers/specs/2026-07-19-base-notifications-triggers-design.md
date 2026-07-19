# Base App Notification Triggers — Design (2026-07-19)

Approved by Ivan 2026-07-19: ship both triggers (overtake + streak expiry).

## Context

Base deprecated FID/Neynar notification webhooks on 2026-04-09. The supported
path is the wallet-address Notifications API on `dashboard.base.org`, already
implemented in `src/lib/baseNotifications.ts` (send + broadcast + opted-in
fetch) and exposed manually via `POST /api/notify` (admin secret). What is
missing is automatic triggers and a scheduler.

API constraints (docs.base.org): title <= 30 chars, message <= 200 chars,
`target_path` in-app only, 20 requests/min per IP shared across all three
endpoints, <= 1000 addresses per send, identical notifications dedupe within
24h. Delivery only to users who pinned the app in Base App and enabled
notifications; sending to non-opted addresses is a server-side no-op.

## Trigger 1: "You got passed" (event-driven)

In `src/app/api/score/submit/route.ts`, after a run that sets a new personal
all-time best (`score > previousBest` and `previousBest > 0` — first-ever
submits never notify anyone), look up players whose all-time score sits in
`(previousBest, score)` on the `scores` zset. These players were just
overtaken.

- Cap at the 5 nearest overtaken players (highest scores below the new best).
- Per-recipient cooldown: `notify_cd:overtake:{addr}` SET NX EX 6h.
- One batched send, same copy for all recipients (also leverages Base 24h
  dedupe as a second spam guard).
- Runs inside `after()` (same pattern as `trackEconomyEventAfter`), fully
  try/caught: notification failures never affect the submit response.
- Skips silently when `BASE_NOTIFICATIONS_API_KEY` is unset (local dev).

Implementation lives in `src/lib/notificationTriggers.ts` to keep the submit
route lean.

## Trigger 2: "Streak expiring" (daily cron)

New route `GET /api/notify/cron`:

- Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel cron convention);
  `x-admin-secret: NOTIFY_ADMIN_SECRET` also accepted for manual testing.
- Fetch opted-in addresses, then `MGET economy_checkin:{addr}` in chunks.
- Recipients: `streak > 0 && lastDate === yesterday(UTC)` — i.e. an active
  streak with no check-in yet today.
- One batched send, generic copy (no per-user streak number in v1 — grouping
  per streak value would explode into many send calls against the 20 req/min
  limit).

Scheduler: new `vercel.json` with a single cron `0 17 * * *` (17:00 UTC —
late enough that most players who will check in organically already have,
early enough to act on the reminder before the UTC rollover).

## Cron segmentation (streak → check-in → onboarding)

Verified 2026-07-19 across 423 opted-in wallets: 10 streak-expiring, 238 did
nothing (no play, no check-in), 90 played but never checked in, 7 checked in
but never played, 88 did both. The "did nothing" 238 qualify for both the
check-in and the first-run nudge, so the cron assigns each wallet to exactly
ONE segment by priority and sends one push per wallet per day:

1. Streak reminder — active streak, not checked in today (time-sensitive, no
   cooldown; Base dedupes identical sends within 24h).
2. Check-in nudge — never checked in at all (`economy_checkin` missing, or
   `lastDate == null && total == 0`). 14-day cooldown `notify_cd:checkin:*`.
3. First-run onboarding — checked in but no `scores` entry. 14-day cooldown
   `notify_cd:onboard:*`.

Priority chosen 2026-07-19 (Ivan): check-in before onboarding, so the 238
dormant wallets get the lower-friction check-in nudge; onboarding then reaches
only the 7 who checked in but never played.

## Trigger 3: "First run" onboarding (daily cron, same route)

Data (2026-07-19): of 423 opted-in wallets, only 178 (42%) have ever posted a
leaderboard score. The other 245 pinned the app + enabled notifications but
never completed a run. Streak/overtake copy is meaningless to them; they need
a first-run nudge.

In `GET /api/notify/cron`, after the streak phase:

- Load the full `scores` zset member set once (`zrange scores 0 -1`).
- Onboarding candidates = opted-in addresses NOT in the score set.
- Exclude anyone already selected for the streak reminder this run (a checked-
  in-but-never-played user should get one push, not two; streak wins).
- Cooldown `notify_cd:onboard:{addr}` (14 days) so a still-inactive user gets
  at most a gentle re-nudge every two weeks, never daily.
- One batched send.

`?dryRun=1` computes and returns all recipient counts without sending or
claiming cooldowns — lets the operator preview reach before going live.

## Copy (English, matches game UI; no emoji, plain human tone)

- Overtake: title `Someone passed you` / message `You dropped a spot on the
  Base Runner leaderboard. Jump in and take it back.`
- Streak: title `Your streak ends tonight` / message `Check in before midnight
  UTC to keep your Base Runner streak alive.`
- Onboarding: title `You haven't played yet` / message `You've got Base Runner
  pinned but never made a run. Give it a shot.`

## Env vars

- `BASE_NOTIFICATIONS_API_KEY` — from Base Dashboard project settings.
- `NEXT_PUBLIC_APP_URL` — already required by `baseNotifications.ts`.
- `CRON_SECRET` — set in Vercel so cron invocations are authenticated.

## Out of scope (v1)

Chest/spin reminders, per-user streak numbers in copy, in-game "enable
notifications" CTA via the `user/status` endpoint, telemetry on notification
sends.
