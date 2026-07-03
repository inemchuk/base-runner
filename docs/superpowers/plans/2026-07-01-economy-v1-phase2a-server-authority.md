# Economy V1 Phase 2A Server Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Focus fragments, craft, and top-up mutation from local-only helpers to a server-authoritative local/Redis layer, without connecting spin/check-in/quests/levels yet.

**Architecture:** Add a pure economy core that owns catalog validation and craft math, then wrap it in a storage layer shared by `/api/shop`, `/api/coins/sync`, and a new `/api/economy` route. The client gets a small `useEconomySync` bridge exposed to `game.js`; shop UI keeps local fallback for localhost/no-wallet, but server actions are preferred when available.

**Tech Stack:** Next.js App Router Route Handlers, TypeScript, module-scoped memory fallback for local dev, optional Upstash Redis, existing `public/game/game.js` canvas app.

## Global Constraints

- Keep this phase local/development safe; do not deploy client-authored fragments as authoritative.
- Do not connect daily spin, check-in, quests, or XP level rewards to fragments in this phase.
- Do not add universal fragments. Store progress per item ID.
- Do not grant full legendary cosmetics from level/reward logic in this phase.
- Keep `/api/shop` from accepting `fragments`, `focusItemId`, or `topUpFragments` as trusted client writes.
- Canonical direct prices: common `150-250`, rare `750-900`, epic `1200-1600`, legendary `fragment-only`.
- Canonical check-in weekly value: `190 coins`, `10 Focus fragments`, `5 booster charges`, `75 XP`.
- Canonical spin EV: `0.88` Focus fragments/day before crates, about `1.18` with crate EV; direct cosmetic slot is `2%` and excludes legendary.
- Canonical Gear Crate: `50 coins + 5 Focus fragments + 3 random boosters`.
- Follow existing App Router `route.ts` conventions from `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

---

### Task 1: Pure Economy Core

**Files:**
- Create: `src/lib/economy/config.ts`
- Create: `src/lib/economy/core.ts`
- Test: `scripts/test-economy-core.mjs`

**Interfaces:**
- Produces:
  - `ECONOMY_TIERS`
  - `CRAFT_CONFIG`
  - `CHECKIN_REWARDS`
  - `SPIN_REWARD_TABLE`
  - `REWARD_CONTAINERS`
  - `getSpinFragmentEv(): { base: number; withCrates: number }`
  - `normalizeShopData(input?: Partial<EconomyShopData>): EconomyShopData`
  - `getCraftMeta(itemId: string | null | undefined): CraftMeta | null`
  - `setFocus(state: EconomyShopData, itemId: string): EconomyMutationResult`
  - `awardFragments(state: EconomyShopData, itemId: string, amount: number): EconomyMutationResult`
  - `topUpFragments(state: EconomyShopData, itemId: string, coins: number): EconomyMutationResult`
  - `craftItem(state: EconomyShopData, itemId: string, coins: number): EconomyMutationResult`

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import {
  CHECKIN_REWARDS,
  REWARD_CONTAINERS,
  getSpinFragmentEv,
} from '../src/lib/economy/config.ts';
import {
  awardFragments,
  craftItem,
  normalizeShopData,
  setFocus,
  topUpFragments,
} from '../src/lib/economy/core.ts';

const checkinWeek = CHECKIN_REWARDS.reduce((sum, reward) => ({
  coins: sum.coins + (reward.coins || 0) + (reward.container ? REWARD_CONTAINERS[reward.container].coins || 0 : 0),
  fragments: sum.fragments + (reward.fragments || 0) + (reward.container ? REWARD_CONTAINERS[reward.container].fragments || 0 : 0),
  boosters: sum.boosters + (reward.boosters || 0) + (reward.container ? REWARD_CONTAINERS[reward.container].boosters || 0 : 0),
  xp: sum.xp + (reward.xp || 0) + (reward.container ? REWARD_CONTAINERS[reward.container].xp || 0 : 0),
}), { coins: 0, fragments: 0, boosters: 0, xp: 0 });
assert.deepEqual(checkinWeek, { coins: 190, fragments: 10, boosters: 5, xp: 75 });
assert.deepEqual(getSpinFragmentEv(), { base: 0.88, withCrates: 1.18 });

const base = normalizeShopData({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });

assert.equal(setFocus(base, 'skin_8').ok, true);
assert.equal(setFocus(base, 'skin_cryptokid').error, 'already_owned');

const withFragments = awardFragments(base, 'skin_8', 99).state;
assert.equal(withFragments.fragments.skin_8, 60);

const topUp = topUpFragments(normalizeShopData({ fragments: { skin_1: 17 } }), 'skin_1', 500);
assert.equal(topUp.ok, true);
assert.equal(topUp.state.fragments.skin_1, 20);
assert.equal(topUp.coinsDelta, -105);

const crafted = craftItem(normalizeShopData({ fragments: { skin_8: 60 }, owned: ['skin_cryptokid'] }), 'skin_8', 500);
assert.equal(crafted.ok, true);
assert.equal(crafted.state.owned.includes('skin_8'), true);
assert.equal(crafted.coinsDelta, -500);
assert.equal(crafted.state.fragments.skin_8, 0);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --experimental-strip-types scripts/test-economy-core.mjs`

Expected: FAIL because `src/lib/economy/core.ts` does not exist yet.

- [ ] **Step 3: Implement pure core**

Create immutable-ish helpers that clone normalized state, validate item existence/type/ownership, cap fragments by tier, disable legendary top-up, deduct craft/top-up fees through `coinsDelta`, and grant the correct owned array by item type.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node --experimental-strip-types scripts/test-economy-core.mjs`

Expected: PASS.

### Task 2: Shared Server Storage

**Files:**
- Create: `src/lib/economy/storage.ts`
- Modify: `src/app/api/shop/route.ts`
- Modify: `src/app/api/coins/sync/route.ts`
- Test: `scripts/verify-economy-server-authority.mjs`

**Interfaces:**
- Consumes: `normalizeShopData` and `EconomyShopData` from Task 1.
- Produces:
  - `readShop(address: string): Promise<EconomyShopData>`
  - `writeShop(address: string, data: EconomyShopData): Promise<void>`
  - `mergeClientShop(address: string, input: Partial<EconomyShopData>): Promise<EconomyShopData>`
  - `readCoins(address: string): Promise<number>`
  - `writeCoins(address: string, balance: number): Promise<void>`

- [ ] **Step 1: Write failing static verification**

```js
assert.match(read('src/app/api/shop/route.ts'), /mergeClientShop/, 'shop POST should merge through server storage');
assert.doesNotMatch(read('src/app/api/shop/route.ts'), /body\.fragments|body\.focusItemId|body\.topUpFragments/, 'shop POST must not trust economy fields');
assert.match(read('src/app/api/coins/sync/route.ts'), /writeCoins/, 'coin sync should share economy coin storage');
```

- [ ] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: FAIL until storage and route changes exist.

- [ ] **Step 3: Implement storage and route changes**

Use Upstash when configured, otherwise module maps. `/api/shop` GET should return normalized state including economy fields. `/api/shop` POST should preserve server-owned `fragments`, `focusItemId`, and `topUpFragments`, while continuing to support existing gear sync.

- [ ] **Step 4: Run verifier**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: storage assertions PASS.

### Task 3: Server Economy Actions

**Files:**
- Create: `src/app/api/economy/route.ts`
- Modify: `scripts/verify-economy-server-authority.mjs`

**Interfaces:**
- Consumes: `readShop`, `writeShop`, `readCoins`, `writeCoins`, and core mutations.
- Produces:
  - `GET /api/economy?address=0x...`
  - `POST /api/economy { address, action: 'setFocus' | 'topUp' | 'craft', itemId }`

- [ ] **Step 1: Add failing verifier checks**

```js
const economyRoute = read('src/app/api/economy/route.ts');
assert.match(economyRoute, /action === 'setFocus'/);
assert.match(economyRoute, /action === 'topUp'/);
assert.match(economyRoute, /action === 'craft'/);
assert.doesNotMatch(economyRoute, /action === 'awardFragments'/, 'public API must not expose arbitrary fragment grants');
```

- [ ] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: FAIL because route is missing.

- [ ] **Step 3: Implement route**

Return `{ ok, shop, coins, result }`. For craft/top-up, use server coin balance and persist both shop and coins only when mutation succeeds.

- [ ] **Step 4: Run verifier**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: route assertions PASS.

### Task 4: Client Bridge And Game Hookup

**Files:**
- Create: `src/hooks/useEconomySync.ts`
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Test: `scripts/verify-economy-server-authority.mjs`

**Interfaces:**
- Produces browser globals:
  - `window.__BASE_ECONOMY_FETCH(): Promise<void>`
  - `window.__BASE_ECONOMY_ACTION(payload): Promise<{ ok: boolean }>`
- Consumes game helpers:
  - `Shop.applyServerEconomyData(data)`
  - existing local fallback `setFocusItemLocal`, `topUpFragmentsLocal`, `craftItemLocal`

- [ ] **Step 1: Add failing verifier checks**

```js
assert.match(read('src/components/Game.tsx'), /useEconomySync\(\)/);
assert.match(read('src/hooks/useEconomySync.ts'), /__BASE_ECONOMY_ACTION/);
assert.match(read('public/game/game.js'), /applyServerEconomyData/);
assert.match(read('public/game/game.js'), /__BASE_ECONOMY_ACTION/);
```

- [ ] **Step 2: Run verifier and verify RED**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: FAIL until hook and game bridge are implemented.

- [ ] **Step 3: Implement hook and game bridge**

Hydrate server economy on wallet connect. On focus/top-up/craft buttons, call the server action if available; if unavailable, keep existing local-only fallback. After server response, hydrate local shop/economy state and refresh visible views.

- [ ] **Step 4: Run verifier**

Run: `node scripts/verify-economy-server-authority.mjs`

Expected: bridge assertions PASS.

### Task 5: Build Verification

**Files:**
- Modify only if required by test/build failures.

**Interfaces:**
- Consumes all previous tasks.
- Produces verified Phase 2A slice.

- [ ] **Step 1: Run all targeted checks**

Run:

```bash
node --experimental-strip-types scripts/test-economy-core.mjs
node scripts/verify-economy-server-authority.mjs
node scripts/verify-economy-v1-local.mjs
node --check public/game/game.js
npm run build
```

- [ ] **Step 2: Fix failures with smallest scoped edits**

Expected: targeted tests, syntax check, and build pass. Existing lint debt can stay out of scope unless this phase adds new lint errors.
