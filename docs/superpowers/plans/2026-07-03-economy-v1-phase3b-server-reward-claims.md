# Economy V1 Phase 3B Server Reward Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route economy-bearing reward claims through server-authoritative claim actions, starting with daily check-in.

**Architecture:** Keep canonical reward tables in `src/lib/economy/config.ts`. Add a server reward bundle applicator that can apply coins, Focus fragments, containers, and boosters to economy storage without accepting arbitrary client-selected reward amounts. Expose a narrow claim route where the client can ask for a known source such as `checkin`, and the server computes the reward and duplicate protection.

**Tech Stack:** Next.js App Router Route Handlers, existing `public/game/game.js` canvas app, wagmi check-in hook, shared economy config/core/storage.

## Global Constraints

- Keep local fallback behavior for localhost/no-wallet development.
- Do not expose a public API that grants arbitrary fragments or arbitrary reward bundles.
- Do not add universal fragments. Store progress per item ID.
- Check-in rewards use canonical `CHECKIN_REWARDS`.
- Fragment overflow converts to capped fallback coins.
- Do not change coin art/logo.
- Do not start the local dev server as part of this phase unless explicitly requested.

---

### Task 1: Check-In Server Reward Claim

**Files:**
- Create: `scripts/verify-economy-reward-claims.mjs`
- Modify: `src/lib/economy/storage.ts`
- Create: `src/lib/economy/rewards.ts`
- Create: `src/app/api/economy/claim/route.ts`
- Modify: `src/hooks/useEconomySync.ts`
- Modify: `public/game/game.js`

**Interfaces:**
- Consumes: `CHECKIN_REWARDS`, `REWARD_CONTAINERS`, `awardFragments`, `readShop`, `writeShop`, `readCoins`, `writeCoins`.
- Produces:
  - `applyRewardBundle(state, coins, bundle, options)`
  - `readCheckinRewardState(address)`
  - `writeCheckinRewardState(address, state)`
  - `POST /api/economy/claim { address, source: 'checkin' }`
  - `window.__BASE_ECONOMY_CLAIM({ source: 'checkin' })`

- [x] **Step 1: Write RED verifier**

Add assertions that the claim route exists, only accepts canonical `checkin`, uses `CHECKIN_REWARDS`, stores check-in reward state, exposes `__BASE_ECONOMY_CLAIM`, and that `base-checkin-confirmed` no longer directly applies `RewardEconomy.applyBundleLocal`.

- [x] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-economy-reward-claims.mjs`
Expected: FAIL before implementation.

- [x] **Step 3: Add server reward state and bundle applicator**

Store server check-in reward state by address. Apply bundles by adding coins, adding boosters, awarding fragments to active Focus Item, and converting invalid/overflow fragments to fallback coins.

- [x] **Step 4: Add narrow claim route**

`POST /api/economy/claim` accepts only `{ source: 'checkin' }`, computes the current UTC day, prevents duplicate daily claims, picks the reward from the canonical streak cycle, persists shop/coins/check-in reward state, and returns `{ ok, shop, coins, reward, result, checkin }`.

- [x] **Step 5: Wire client bridge and game check-in confirmation**

Expose `window.__BASE_ECONOMY_CLAIM`. On `base-checkin-confirmed`, prefer the server claim route; if unavailable or failed, keep the current local fallback.

- [x] **Step 6: Verify**

Run:

```bash
node scripts/verify-economy-reward-claims.mjs
node scripts/verify-economy-server-authority.mjs
node scripts/verify-economy-reward-sources.mjs
node --check public/game/game.js
git diff --check
```

Expected: all pass.

### Task 2: Quest And Level Server Claims

**Files:**
- Modify: `src/app/api/economy/claim/route.ts`
- Modify: `src/app/api/quests/route.ts`
- Modify: `src/app/api/score/submit/route.ts`
- Modify: `src/hooks/useEconomySync.ts`
- Modify: `src/hooks/useLeaderboard.ts`
- Modify: `public/game/game.js`
- Create: `src/lib/economy/quests.ts`
- Create: `src/lib/economy/levels.ts`
- Test: `scripts/verify-economy-reward-claims.mjs`

**Interfaces:**
- Produces future claim payloads:
  - `{ source: 'quest', questId, level }`
  - `{ source: 'level', level }`

- [x] **Step 1: Make quest progress server-verifiable before claiming**
- [x] **Step 2: Route quest rewards through `POST /api/economy/claim`**
- [x] **Step 3: Route level rewards through `POST /api/economy/claim`**
- [x] **Step 4: Verify duplicate claim protection and no arbitrary reward grants**

Implementation notes:
- Quest progress now derives from accepted `/api/score/submit` runs. `/api/quests` no longer trusts client-authored quest state as authoritative.
- XP/level progress now derives from accepted `/api/score/submit` runs. Level rewards claim through `{ source: 'level', level }` and use server duplicate protection.
- Client-side local fallback remains for no-wallet/local mode, but server rejections do not silently grant rewards locally.

### Compatibility Checkpoint: Legacy Local Data Hydration

**Files:**
- Create: `src/app/api/economy/hydrate/route.ts`
- Modify: `src/hooks/useEconomySync.ts`
- Modify: `src/lib/economy/storage.ts`
- Modify: `public/game/game.js`

- [x] Preserve existing local coin balances by hydrating the server to `max(serverCoins, legacyLocalCoins)` before the first server reward claim.
- [x] Preserve existing shop gear, boosters, Focus fragments, top-ups, equipped skin/trail/death effect, and best score by merging legacy localStorage into server state.
- [x] Preserve existing quest progress with max progress and claimed-level union.
- [x] Preserve existing XP level progress while marking already reached legacy level reward milestones as claimed, preventing duplicate level reward payouts.
- [x] Expose `Save`, `Shop`, `Quests`, `Xp`, and `RewardEconomy` on `window` so React sync/hydration bridges can actually apply merged server data.
- [x] Keep transaction hooks untouched in this checkpoint. Check-in/paymaster, spin contract config, and NFT mint flow are not modified by legacy hydration.

Task 2 intentionally follows Task 1 because current quest and XP progress are still client-synced; doing them first would make a trust-heavy reward path look authoritative when it is not.
