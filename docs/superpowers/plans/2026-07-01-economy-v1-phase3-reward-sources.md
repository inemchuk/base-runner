# Economy V1 Phase 3 Reward Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the canonical Economy V1 reward tables to daily spin, check-in, quests, and level rewards without reintroducing cheap direct legendary/cosmetic bypasses.

**Architecture:** Keep server-authoritative spin rewards in `/api/spin`, because spin is already server-picked. Add a client-side reward bundle helper for local/on-chain-confirmed reward presentation paths that still live in `game.js` today: check-in, quests, and XP level milestones. Use server economy state hydration for server-applied spin rewards and keep local fallback behavior for no-wallet/dev flows.

**Tech Stack:** Next.js App Router Route Handlers, existing `public/game/game.js` canvas app, shared economy config/core/storage from Phase 2A.

## Global Constraints

- Daily spin direct cosmetic slot is `2%`, common/rare only, no legendary.
- Check-in weekly value is `190 coins`, `10 Focus fragments`, `5 boosters`, `75 XP`.
- Gear Crate is `50 coins + 5 Focus fragments + 3 random boosters`.
- Quests alternate coins/boosters/fragments/crates instead of coins-only.
- Levels 30/35 do not directly grant legendary cosmetics.
- Public APIs must not expose arbitrary client-chosen fragment grants.

---

### Task 1: Reward Source Verifier

**Files:**
- Create: `scripts/verify-economy-reward-sources.mjs`

**Steps:**
- [ ] Add assertions that `/api/spin` imports canonical economy helpers, excludes legendary direct prizes, and no longer contains the old broad cosmetic pool.
- [ ] Add assertions that `game.js` contains `RewardEconomy`, canonical check-in totals, mixed quest reward bundles, and no direct level-30 legendary unlock.
- [ ] Run `node scripts/verify-economy-reward-sources.mjs` and verify RED.

### Task 2: Server Spin Reward Source

**Files:**
- Modify: `src/app/api/spin/route.ts`
- Modify: `src/hooks/useDailySpin.ts`
- Modify: `public/game/game.js`

**Steps:**
- [ ] Replace the old spin pool with canonical 100-weight prize entries.
- [ ] Apply server-side coins, boosters, fragments, crates, and common/rare direct cosmetics using economy storage.
- [ ] Return `shop` and `coins` with the prize; mark server-applied prizes so the client does not double-award.
- [ ] Update spin UI handling for `fragments`, `xp`, `crate`, and server-applied state.

### Task 3: Local Reward Bundles For Check-In, Quests, Levels

**Files:**
- Modify: `public/game/game.js`

**Steps:**
- [ ] Add `RewardEconomy.applyBundleLocal` for coins, boosters, Focus fragments, XP, and containers.
- [ ] Replace check-in `DAY_COINS`/UI rewards with canonical 7-day bundles.
- [ ] Replace quest `reward: number` with mixed reward bundles and update claim/render labels.
- [ ] Replace direct legendary level rewards with crates/bundles and route bundles through `RewardEconomy`.

### Task 4: Verification

**Files:**
- Modify only if required by failures.

**Steps:**
- [ ] Run reward source verifier, server authority verifier, local economy verifier, `node --check public/game/game.js`, and production build.

### Task 5: Daily Spin Idempotency

**Files:**
- Modify: `src/app/api/spin/route.ts`
- Modify: `src/hooks/useDailySpin.ts`
- Test: `scripts/verify-economy-reward-sources.mjs`

**Steps:**
- [x] Add a client-generated `spinId` for each visible spin attempt.
- [x] Store the applied server spin response by `{ address, UTC day, spinId }`.
- [x] Return the stored response for duplicate `spinId` requests without charging coins, incrementing spin count, or granting rewards again.
- [x] Avoid long server waits: duplicate in-flight requests should return quickly with `spin_pending`, not block the claim UI.
- [x] Keep the existing spin transaction/config hooks untouched.
- [x] Verify with reward-source checks, TypeScript, and `node --check public/game/game.js`.

### Task 6: Lightweight Server Economy Telemetry

**Files:**
- Create: `src/lib/economy/telemetry.ts`
- Create: `scripts/verify-economy-telemetry.mjs`
- Modify: `src/app/api/economy/route.ts`
- Modify: `src/app/api/economy/claim/route.ts`
- Modify: `src/app/api/spin/route.ts`

**Steps:**
- [x] Add best-effort server telemetry helper using Next `after()` so event writes do not block claim responses.
- [x] Store events in date-partitioned Redis/memory keys: `economy_events:{date}`.
- [x] Track focus set/switch, coin spend, fragment top-up, craft completed, spin result, check-in claim, quest claim, and level reward claim.
- [x] Track reward-derived coin/fragment/booster events from server-applied reward bundles.
- [x] Keep client gameplay telemetry such as booster used/run summary out of this server-only checkpoint.
- [x] Verify with `scripts/verify-economy-telemetry.mjs`, TypeScript, and existing economy verifiers.
