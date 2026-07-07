# Fragment Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop converting awarded fragments to coins when there is no focus item; instead bank them in a fungible pool that auto-drains into the next focus item (capped for legendary).

**Architecture:** Add `pooledFragments` + `poolAppliedFragments` to the economy shop state and a `poolCapPct` per tier. A single new primitive `awardFragmentsToShop` fills the focus item then overflows to the pool (never coins). `setFocus` drains the pool into the newly-focused item up to its tier cap, tracked cumulatively so re-focusing can't bypass the cap. Both server award paths (`rewards.ts`, `spin/route.ts`) and the client mirror in `game.js` are switched from coin-fallback to pool.

**Tech Stack:** TypeScript (Next.js 16 API routes + `src/lib/economy/*`), vanilla JS client (`public/game/game.js`). Tests run with Node's built-in runner and type stripping: `node --test --experimental-strip-types <file>` (Node 22.11 confirmed).

**Spec:** `docs/superpowers/specs/2026-07-07-fragment-pool-design.md`

---

### Task 1: Add `poolCapPct` to tier config

**Files:**
- Modify: `src/lib/economy/config.ts` (`TierConfig` interface ~line 4, `ECONOMY_TIERS` ~line 54)
- Test: `src/lib/economy/config.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/economy/config.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY_TIERS } from './config.ts';

test('poolCapPct is 1 for non-legendary tiers, 0.5 for legendary', () => {
  assert.equal(ECONOMY_TIERS.common.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.rare.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.epic.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.legendary.poolCapPct, 0.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/lib/economy/config.test.ts`
Expected: FAIL (`poolCapPct` is `undefined`).

- [ ] **Step 3: Add the field**

In `src/lib/economy/config.ts`, add to `TierConfig`:

```ts
export interface TierConfig {
  fragments: number;
  craftFee: number;
  topUpCost: number;
  topUpCapPct: number;
  poolCapPct: number;
  directPriceRange: { min: number; max: number } | null;
}
```

Add `poolCapPct` to each `ECONOMY_TIERS` entry: `common`, `rare`, `epic` → `poolCapPct: 1`; `legendary` → `poolCapPct: 0.5`. Example for `common`:

```ts
  common: {
    fragments: 10,
    craftFee: 40,
    topUpCost: 20,
    topUpCapPct: 0.2,
    poolCapPct: 1,
    directPriceRange: { min: 150, max: 250 },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/lib/economy/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/config.ts src/lib/economy/config.test.ts
git commit -m "feat(economy): add poolCapPct per tier"
```

---

### Task 2: Add pool fields to shop state

**Files:**
- Modify: `src/lib/economy/core.ts` (`EconomyShopData` ~line 11, `DEFAULT_SHOP` ~line 46, `normalizeShopData` ~line 59)
- Test: `src/lib/economy/core.pool.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/economy/core.pool.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShopData } from './core.ts';

test('normalizeShopData defaults pool fields', () => {
  const s = normalizeShopData({});
  assert.equal(s.pooledFragments, 0);
  assert.deepEqual(s.poolAppliedFragments, {});
});

test('normalizeShopData clamps pooledFragments and drops zero pool entries', () => {
  const s = normalizeShopData({
    pooledFragments: -5,
    poolAppliedFragments: { skin_1: 3, skin_2: 0, skin_3: -2 },
  } as never);
  assert.equal(s.pooledFragments, 0);
  assert.deepEqual(s.poolAppliedFragments, { skin_1: 3 });
});

test('normalizeShopData floors fractional pooledFragments', () => {
  const s = normalizeShopData({ pooledFragments: 4.9 } as never);
  assert.equal(s.pooledFragments, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: FAIL (`pooledFragments` undefined).

- [ ] **Step 3: Add the fields**

In `src/lib/economy/core.ts`, extend `EconomyShopData`:

```ts
  focusItemId: string | null;
  fragments: Record<string, number>;
  topUpFragments: Record<string, number>;
  pooledFragments: number;
  poolAppliedFragments: Record<string, number>;
}
```

Extend `DEFAULT_SHOP`:

```ts
  fragments: {},
  topUpFragments: {},
  pooledFragments: 0,
  poolAppliedFragments: {},
};
```

In `normalizeShopData`, add before the `return`:

```ts
  const pooledFragments = Math.max(0, Math.floor(Number(input.pooledFragments) || 0));
  const poolAppliedFragments = normalizeNumberRecord(input.poolAppliedFragments);
```

and include both in the returned object (alongside `topUpFragments`):

```ts
    topUpFragments,
    pooledFragments,
    poolAppliedFragments,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/core.ts src/lib/economy/core.pool.test.ts
git commit -m "feat(economy): add pooledFragments + poolAppliedFragments to shop state"
```

---

### Task 3: `awardFragmentsToShop` primitive (fill focus, overflow to pool)

**Files:**
- Modify: `src/lib/economy/core.ts` (add exported function after `awardFragments` ~line 123)
- Test: `src/lib/economy/core.pool.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/economy/core.pool.test.ts`:

```ts
import { awardFragmentsToShop } from './core.ts';

test('awardFragmentsToShop with no focus banks everything in the pool', () => {
  const base = normalizeShopData({});
  const r = awardFragmentsToShop(base, 3);
  assert.equal(r.toFocus, 0);
  assert.equal(r.toPool, 3);
  assert.equal(r.state.pooledFragments, 3);
});

test('awardFragmentsToShop fills focus then overflows to pool', () => {
  // skin_1 is rare (needs 20). Start with 18 already on it.
  const base = normalizeShopData({ focusItemId: 'skin_1', fragments: { skin_1: 18 } });
  const r = awardFragmentsToShop(base, 5);
  assert.equal(r.toFocus, 2);          // fills 18 -> 20
  assert.equal(r.toPool, 3);           // remaining 3 -> pool
  assert.equal(r.state.fragments.skin_1, 20);
  assert.equal(r.state.pooledFragments, 3);
});

test('awardFragmentsToShop with full focus banks everything', () => {
  const base = normalizeShopData({ focusItemId: 'skin_1', fragments: { skin_1: 20 } });
  const r = awardFragmentsToShop(base, 4);
  assert.equal(r.toFocus, 0);
  assert.equal(r.toPool, 4);
  assert.equal(r.state.pooledFragments, 4);
});

test('awardFragmentsToShop never touches coins and ignores non-positive amounts', () => {
  const base = normalizeShopData({});
  const r = awardFragmentsToShop(base, 0);
  assert.equal(r.toFocus, 0);
  assert.equal(r.toPool, 0);
  assert.equal(r.state.pooledFragments, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: FAIL (`awardFragmentsToShop` not exported).

- [ ] **Step 3: Implement the primitive**

In `src/lib/economy/core.ts`, add after `awardFragments`:

```ts
export interface AwardFragmentsResult {
  state: EconomyShopData;
  toFocus: number;
  toPool: number;
}

// Award loose fragments: fill the active (unowned, not-full) focus item first,
// overflow into the untyped pool. Never converts to coins.
export function awardFragmentsToShop(state: EconomyShopData, amount: number): AwardFragmentsResult {
  const normalized = normalizeShopData(state);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (add <= 0) return { state: normalized, toFocus: 0, toPool: 0 };

  let toFocus = 0;
  const focusId = normalized.focusItemId;
  const meta = getCraftMeta(focusId);
  if (focusId && meta && !ownsItem(normalized, focusId, meta.type)) {
    const current = normalized.fragments[focusId] || 0;
    toFocus = Math.min(Math.max(0, meta.fragments - current), add);
  }

  const toPool = add - toFocus;
  const next: EconomyShopData = {
    ...normalized,
    fragments: toFocus > 0 && focusId
      ? { ...normalized.fragments, [focusId]: (normalized.fragments[focusId] || 0) + toFocus }
      : normalized.fragments,
    pooledFragments: normalized.pooledFragments + toPool,
  };
  return { state: next, toFocus, toPool };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/core.ts src/lib/economy/core.pool.test.ts
git commit -m "feat(economy): awardFragmentsToShop fills focus then pool"
```

---

### Task 4: `setFocus` drains the pool (with legendary cap) + craft cleanup

**Files:**
- Modify: `src/lib/economy/core.ts` (`setFocus` ~line 102, `craftItem` ~line 151)
- Test: `src/lib/economy/core.pool.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/economy/core.pool.test.ts`:

```ts
import { setFocus, craftItem } from './core.ts';

test('setFocus drains the pool up to 100% for a rare item', () => {
  // skin_1 rare needs 20; pool has 25.
  const base = normalizeShopData({ pooledFragments: 25 });
  const r = setFocus(base, 'skin_1');
  assert.equal(r.ok, true);
  assert.equal(r.state.fragments.skin_1, 20);
  assert.equal(r.state.pooledFragments, 5);
  assert.equal(r.state.poolAppliedFragments.skin_1, 20);
});

test('setFocus caps the pool drain at 50% for a legendary item', () => {
  // skin_8 legendary needs 60, poolCapPct 0.5 -> max 30 from pool.
  const base = normalizeShopData({ pooledFragments: 100 });
  const r = setFocus(base, 'skin_8');
  assert.equal(r.ok, true);
  assert.equal(r.state.fragments.skin_8, 30);
  assert.equal(r.state.pooledFragments, 70);
  assert.equal(r.state.poolAppliedFragments.skin_8, 30);
});

test('legendary pool cap is cumulative across re-focus', () => {
  // Focus legendary (drain 30), switch away, focus again: no extra drain.
  const base = normalizeShopData({ pooledFragments: 100 });
  const first = setFocus(base, 'skin_8');
  const away = setFocus(first.state, 'skin_9'); // another legendary, drains its own 30
  const again = setFocus(away.state, 'skin_8');
  assert.equal(again.state.fragments.skin_8, 30);      // unchanged
  assert.equal(again.state.poolAppliedFragments.skin_8, 30);
});

test('craftItem clears pool accounting for the crafted item', () => {
  const focused = setFocus(normalizeShopData({ pooledFragments: 25 }), 'skin_1');
  const crafted = craftItem(focused.state, 'skin_1', 1000);
  assert.equal(crafted.ok, true);
  assert.equal(crafted.state.fragments.skin_1 || 0, 0);
  assert.equal(crafted.state.poolAppliedFragments.skin_1 || 0, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: FAIL (pool not drained on setFocus).

- [ ] **Step 3: Implement drain in `setFocus` and cleanup in `craftItem`**

Replace `setFocus` in `src/lib/economy/core.ts`:

```ts
export function setFocus(state: EconomyShopData, itemId: string): EconomyMutationResult {
  const normalized = normalizeShopData(state);
  const meta = getCraftMeta(itemId);
  if (!meta) return fail(normalized, 'invalid_item');
  if (ownsItem(normalized, itemId, meta.type)) return fail(normalized, 'already_owned');

  const withFocus: EconomyShopData = { ...normalized, focusItemId: itemId };

  // Auto-drain the pool into the item, capped per tier so legendary items
  // can't be trivially completed from banked fragments. The cap is cumulative
  // via poolAppliedFragments so toggling focus can't bypass it.
  const current = withFocus.fragments[itemId] || 0;
  const capTotal = Math.floor(meta.fragments * meta.poolCapPct);
  const alreadyPooled = withFocus.poolAppliedFragments[itemId] || 0;
  const allowedFromPool = Math.max(0, capTotal - alreadyPooled);
  const drain = Math.min(withFocus.pooledFragments, meta.fragments - current, allowedFromPool);

  if (drain <= 0) return ok(withFocus, 0);

  return ok({
    ...withFocus,
    fragments: { ...withFocus.fragments, [itemId]: current + drain },
    pooledFragments: withFocus.pooledFragments - drain,
    poolAppliedFragments: { ...withFocus.poolAppliedFragments, [itemId]: alreadyPooled + drain },
  }, 0);
}
```

Note this references `meta.poolCapPct` — add it to `CraftMeta` and `getCraftMeta`. In the `CraftMeta` interface add `poolCapPct: number;` and in `getCraftMeta`'s returned object add `poolCapPct: tier.poolCapPct,`.

In `craftItem`, extend the returned state to also zero `poolAppliedFragments[itemId]`:

```ts
  return ok({
    ...next,
    focusItemId: next.focusItemId === itemId ? null : next.focusItemId,
    fragments: { ...next.fragments, [itemId]: 0 },
    topUpFragments: { ...next.topUpFragments, [itemId]: 0 },
    poolAppliedFragments: { ...next.poolAppliedFragments, [itemId]: 0 },
  }, -meta.craftFee, -meta.fragments);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/lib/economy/core.pool.test.ts`
Expected: PASS. Also run Task 1–3 tests to confirm no regressions:
`node --test --experimental-strip-types src/lib/economy/config.test.ts src/lib/economy/core.pool.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/core.ts src/lib/economy/core.pool.test.ts
git commit -m "feat(economy): setFocus drains pool with cumulative legendary cap"
```

---

### Task 5: Switch `rewards.ts` from coin-fallback to pool

**Files:**
- Modify: `src/lib/economy/rewards.ts`
- Test: `src/lib/economy/rewards.pool.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/economy/rewards.pool.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShopData } from './core.ts';
import { applyRewardBundle } from './rewards.ts';

test('fragment reward with no focus goes to pool, coins unchanged', () => {
  const base = normalizeShopData({});
  const r = applyRewardBundle(base, 100, { fragments: 3 });
  assert.equal(r.coins, 100);                      // no coin conversion
  assert.equal(r.state.pooledFragments, 3);
  assert.equal(r.result.fragmentsPooled, 3);
  assert.equal(r.result.fragmentsAwarded, 0);
});

test('fragment reward with focus fills item then pools overflow', () => {
  const base = normalizeShopData({ focusItemId: 'skin_1', fragments: { skin_1: 19 } });
  const r = applyRewardBundle(base, 100, { fragments: 4 });
  assert.equal(r.coins, 100);
  assert.equal(r.state.fragments.skin_1, 20);
  assert.equal(r.state.pooledFragments, 3);
  assert.equal(r.result.fragmentsAwarded, 1);
  assert.equal(r.result.fragmentsPooled, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/lib/economy/rewards.pool.test.ts`
Expected: FAIL (coins become 130 via fallback; `fragmentsPooled` undefined).

- [ ] **Step 3: Rewrite the fragment path**

In `src/lib/economy/rewards.ts`:

1. Update imports (line 1–2):

```ts
import { REWARD_CONTAINERS, type RewardBundle } from './config.ts';
import { awardFragmentsToShop, type EconomyShopData } from './core.ts';
```

2. Replace `AppliedRewardSummary` (remove `fragmentsOverflowed`/`fallbackCoins`, add `fragmentsPooled`):

```ts
export interface AppliedRewardSummary {
  coinsDelta: number;
  fragmentsAwarded: number;
  fragmentsPooled: number;
  boostersDelta: number;
  xpDelta: number;
}
```

3. Remove `fallbackCoinsPerFragment` from `ApplyRewardBundleOptions`:

```ts
export interface ApplyRewardBundleOptions {
  random?: () => number;
}
```

4. In `applyRewardBundle`, delete the `fallbackCoinsPerFragment` line and update the `result` initializer:

```ts
  const random = options.random || Math.random;
  const result: AppliedRewardSummary = {
    coinsDelta: 0,
    fragmentsAwarded: 0,
    fragmentsPooled: 0,
    boostersDelta: 0,
    xpDelta: 0,
  };

  const nextState = applyBundleRecursive(state, bundle, { random, result, depth: 0 });
```

5. Update `ApplyContext` (remove `fallbackCoinsPerFragment`):

```ts
interface ApplyContext {
  random: () => number;
  result: AppliedRewardSummary;
  depth: number;
}
```

6. Fix the recursive call that passes `depth` (it currently spreads `ctx` with `fallbackCoinsPerFragment` — still fine after removal). The container recursion `{ ...ctx, depth: ctx.depth + 1 }` needs no change.

7. Replace `applyFocusFragments`, `focusCanReceiveFragments`, and `addFallbackCoins` with a single pool-aware helper:

```ts
function applyFocusFragments(state: EconomyShopData, amount: number, ctx: ApplyContext): EconomyShopData {
  const r = awardFragmentsToShop(state, amount);
  ctx.result.fragmentsAwarded += r.toFocus;
  ctx.result.fragmentsPooled += r.toPool;
  return r.state;
}
```

(Delete `focusCanReceiveFragments` and `addFallbackCoins` entirely; `awardFragments`/`getCraftMeta`/`ownsItem` imports are no longer needed here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/lib/economy/rewards.pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/rewards.ts src/lib/economy/rewards.pool.test.ts
git commit -m "feat(economy): rewards bundle banks fragment overflow to pool"
```

---

### Task 6: Update claim route + telemetry field names

**Files:**
- Modify: `src/app/api/economy/claim/route.ts` (~lines 5, 40–41, 81, 141, 212)
- Modify: `src/lib/economy/telemetry.ts` (~lines 83–91)

- [ ] **Step 1: Update the claim route**

In `src/app/api/economy/claim/route.ts`:
- Remove `FRAGMENT_FALLBACK_COINS` from the import on line 5 (keep `CHECKIN_REWARDS`).
- In the local result-shape default (~lines 40–41), replace `fragmentsOverflowed: 0, fallbackCoins: 0,` with `fragmentsPooled: 0,`.
- In each `applyRewardBundle(...)` call (~lines 81, 141, 212), drop the `{ fallbackCoinsPerFragment: FRAGMENT_FALLBACK_COINS }` options argument (call with three args). If any of those results are spread into a response using `fragmentsOverflowed`/`fallbackCoins`, rename to `fragmentsPooled` (grep the file for both identifiers and update).

Run to find every reference: `grep -n "fragmentsOverflowed\|fallbackCoins\|FRAGMENT_FALLBACK_COINS" src/app/api/economy/claim/route.ts` and update each.

- [ ] **Step 2: Update telemetry**

In `src/lib/economy/telemetry.ts`, replace the overflow block (~lines 83–91):

```ts
  const fragmentsPooled = Math.max(0, Math.floor(Number(result.fragmentsPooled) || 0));
  if (fragmentsPooled > 0) {
    trackEconomyEventAfter('economy_fragment_pooled', address, {
      source,
      amount: fragmentsPooled,
      ...extra,
    });
  }
```

If `economy_fragment_overflowed` / `economy_fragment_pooled` is part of an `EconomyTelemetryEventName` union in this file, rename the member accordingly (grep for `economy_fragment_overflowed`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `fragmentsOverflowed`, `fallbackCoins`, or `FRAGMENT_FALLBACK_COINS` in these files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/economy/claim/route.ts src/lib/economy/telemetry.ts
git commit -m "refactor(economy): claim route + telemetry use fragmentsPooled"
```

---

### Task 7: Switch spin route from coin-fallback to pool

**Files:**
- Modify: `src/app/api/spin/route.ts`

- [ ] **Step 1: Rewrite the fragment/crate handling**

In `src/app/api/spin/route.ts`:

1. Imports: remove `FRAGMENT_FALLBACK_COINS` from the config import (line 5–11). Add `awardFragmentsToShop` to the core import (line 12).

2. `AwardedPrize` type (~lines 40–48): remove `fragmentsOverflowed?` and `fallbackCoins?`, add `fragmentsPooled?: number;`. Keep `fragmentsAwarded?`.

3. Replace the local `applyFocusFragments` (lines 205–235) with a thin wrapper over the shared primitive:

```ts
function applyFocusFragments(shop: EconomyShopData, amount: number) {
  const r = awardFragmentsToShop(shop, amount);
  return { shop: r.state, fragmentsAwarded: r.toFocus, fragmentsPooled: r.toPool };
}
```

4. Replace `applyContainer` (lines 237–265) so it drops the `fallbackCoinsPerFragment` param and tracks `fragmentsPooled`:

```ts
function applyContainer(shop: EconomyShopData, containerId: string) {
  const bundle = REWARD_CONTAINERS[containerId as keyof typeof REWARD_CONTAINERS];
  if (!bundle) return { shop, coinsDelta: 0, fragmentsAwarded: 0, fragmentsPooled: 0 };

  let nextShop = shop;
  let coinsDelta = 'coins' in bundle ? bundle.coins : 0;
  let fragmentsAwarded = 0;
  let fragmentsPooled = 0;

  const fragments = 'fragments' in bundle ? bundle.fragments : 0;
  if (fragments) {
    const result = applyFocusFragments(nextShop, fragments);
    nextShop = result.shop;
    fragmentsAwarded += result.fragmentsAwarded;
    fragmentsPooled += result.fragmentsPooled;
  }

  const boosters = 'boosters' in bundle ? bundle.boosters : 0;
  if (boosters) nextShop = addRandomBoosters(nextShop, boosters);

  return { shop: nextShop, coinsDelta, fragmentsAwarded, fragmentsPooled };
}
```

5. In `applySpinPrize` (~lines 318–337) update both branches to drop `FRAGMENT_FALLBACK_COINS`, drop `coins += result.coinsDelta` for the fragments branch (fragments never yield coins now — but the crate branch still adds `result.coinsDelta` from `bundle.coins`), and set `fragmentsPooled`:

```ts
  } else if (prize.type === 'fragments' || prize.type === 'fragment_burst') {
    const result = applyFocusFragments(shop, Number(prize.value) || 0);
    shop = result.shop;
    awarded = {
      ...awarded,
      fragmentsAwarded: result.fragmentsAwarded,
      fragmentsPooled: result.fragmentsPooled,
    };
  } else if (prize.type === 'crate') {
    const result = applyContainer(shop, String(prize.value));
    shop = result.shop;
    coins += result.coinsDelta;
    awarded = {
      ...awarded,
      fragmentsAwarded: result.fragmentsAwarded,
      fragmentsPooled: result.fragmentsPooled,
    };
  }
```

6. In the telemetry call at the bottom (~lines 473–486), replace `fragmentsOverflowed: applied.prize.fragmentsOverflowed || 0,` and `fallbackCoins: applied.prize.fallbackCoins || 0,` with `fragmentsPooled: applied.prize.fragmentsPooled || 0,`.

7. Grep the file for any remaining `fragmentsOverflowed` / `fallbackCoins` / `FRAGMENT_FALLBACK_COINS` and remove/rename: `grep -n "fragmentsOverflowed\|fallbackCoins\|FRAGMENT_FALLBACK_COINS" src/app/api/spin/route.ts`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `spin/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/spin/route.ts
git commit -m "feat(economy): spin banks fragment overflow to pool"
```

---

### Task 8: Remove the dead `FRAGMENT_FALLBACK_COINS` constant

**Files:**
- Modify: `src/lib/economy/config.ts`

- [ ] **Step 1: Confirm no remaining consumers**

Run: `grep -rn "FRAGMENT_FALLBACK_COINS" src/ public/game/game.js`
Expected: only the definition in `config.ts` (client `game.js` is handled in Task 10; if `game.js` still references it at this point that's fine — the client copy is a separate constant, not this import). If any `src/**` TS file other than the definition still imports it, fix that first.

- [ ] **Step 2: Remove the constant**

Delete `export const FRAGMENT_FALLBACK_COINS = 10;` (line 52) from `src/lib/economy/config.ts`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/economy/config.ts
git commit -m "chore(economy): drop unused FRAGMENT_FALLBACK_COINS"
```

---

### Task 9: Update spin client types + result copy in `useDailySpin.ts`

**Files:**
- Modify: `src/hooks/useDailySpin.ts` (`SpinPrize` ~lines 21–23)

- [ ] **Step 1: Update the type**

In `src/hooks/useDailySpin.ts`, replace:

```ts
  fragmentsAwarded?: number;
  fragmentsOverflowed?: number;
  fallbackCoins?: number;
```

with:

```ts
  fragmentsAwarded?: number;
  fragmentsPooled?: number;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDailySpin.ts
git commit -m "refactor(spin): client prize carries fragmentsPooled"
```

---

### Task 10: Client (`game.js`) — pool state, drain, award, and display

**Files:**
- Modify: `public/game/game.js` (client tier config ~5992; local mirror ~6224–6235 and ~6242–6267; `_migrateEconomy` ~6411; `setFocusItemLocal` ~6485; `addFragmentsLocal` ~6500; `renderFocusStrip` ~6921; `_awardFragments`/`applyBundleLocal` ~7441–7499; spin prize display ~8551–8563)

There is no unit-test harness for the game.js IIFE modules; verify via `npm run build` (Task 11) and preview. Make these edits precisely.

- [ ] **Step 1: Add `poolCapPct` to the client tier table**

In the `ECONOMY_TIERS` object (~line 5992) add `poolCapPct` to each entry:

```js
  const ECONOMY_TIERS = Object.freeze({
    common:    { fragments: 10, craftFee: 40,  topUpCost: 20,  topUpCapPct: 0.2, poolCapPct: 1 },
    rare:      { fragments: 20, craftFee: 100, topUpCost: 35,  topUpCapPct: 0.2, poolCapPct: 1 },
    epic:      { fragments: 35, craftFee: 220, topUpCost: 60,  topUpCapPct: 0.2, poolCapPct: 1 },
    legendary: { fragments: 60, craftFee: 500, topUpCost: 160, topUpCapPct: 0,   poolCapPct: 0.5 },
  });
```

- [ ] **Step 2: Carry pool fields through the local mirror**

In the merge builder (~line 6232–6235) add the two fields:

```js
      fragments:      local.fragments || {},
      focusItemId:    local.focusItemId || null,
      topUpFragments: local.topUpFragments || {},
      pooledFragments:      Math.max(0, Math.floor(Number(local.pooledFragments) || 0)),
      poolAppliedFragments: (local.poolAppliedFragments && typeof local.poolAppliedFragments === 'object' && !Array.isArray(local.poolAppliedFragments)) ? local.poolAppliedFragments : {},
    };
```

In `applyServerEconomyData` (~line 6256–6260) add server passthrough for both fields, right after `topUpFragments`:

```js
      topUpFragments: serverData.topUpFragments && typeof serverData.topUpFragments === 'object'
        ? serverData.topUpFragments
        : local.topUpFragments,
      pooledFragments: typeof serverData.pooledFragments === 'number'
        ? Math.max(0, Math.floor(serverData.pooledFragments))
        : local.pooledFragments,
      poolAppliedFragments: serverData.poolAppliedFragments && typeof serverData.poolAppliedFragments === 'object' && !Array.isArray(serverData.poolAppliedFragments)
        ? serverData.poolAppliedFragments
        : local.poolAppliedFragments,
    });
```

In `_migrateEconomy` (~line 6411) default both fields:

```js
  function _migrateEconomy(d) {
    _migrateCharges(d);
    if (!d.fragments || typeof d.fragments !== 'object' || Array.isArray(d.fragments)) d.fragments = {};
    if (!d.topUpFragments || typeof d.topUpFragments !== 'object' || Array.isArray(d.topUpFragments)) d.topUpFragments = {};
    if (typeof d.pooledFragments !== 'number' || !Number.isFinite(d.pooledFragments) || d.pooledFragments < 0) d.pooledFragments = 0;
    else d.pooledFragments = Math.floor(d.pooledFragments);
    if (!d.poolAppliedFragments || typeof d.poolAppliedFragments !== 'object' || Array.isArray(d.poolAppliedFragments)) d.poolAppliedFragments = {};
    if (typeof d.focusItemId !== 'string' || !getCraftMeta(d.focusItemId)) d.focusItemId = null;
    return d;
  }
```

- [ ] **Step 3: Add a pool getter + drain the pool in `setFocusItemLocal`**

Add a helper near `addFragmentsLocal` (~line 6500):

```js
  function getPooledFragments() {
    const d = _migrateEconomy(loadShopData());
    return Math.max(0, Math.floor(Number(d.pooledFragments) || 0));
  }
```

Replace `setFocusItemLocal` (~line 6485) to mirror the server drain:

```js
  function setFocusItemLocal(itemId) {
    const meta = getCraftMeta(itemId);
    if (!meta || _ownsItemOfType(itemId, meta.type)) return false;
    const d = _migrateEconomy(loadShopData());
    d.focusItemId = itemId;

    // Auto-drain the pool into the item, capped per tier (mirrors server setFocus).
    const current = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const capTotal = Math.floor(meta.fragments * (meta.poolCapPct != null ? meta.poolCapPct : 1));
    const alreadyPooled = Math.max(0, Math.floor(Number(d.poolAppliedFragments[itemId]) || 0));
    const allowedFromPool = Math.max(0, capTotal - alreadyPooled);
    const drain = Math.min(d.pooledFragments, meta.fragments - current, allowedFromPool);
    if (drain > 0) {
      d.fragments[itemId] = current + drain;
      d.pooledFragments -= drain;
      d.poolAppliedFragments[itemId] = alreadyPooled + drain;
    }

    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return true;
  }
```

Note `getCraftMeta` (client, ~line 6429) already spreads `...tier`, so `meta.poolCapPct` is available after Step 1.

Export `getPooledFragments` in the Shop module's return object (add `getPooledFragments,` near `renderFocusStrip,` ~line 7301).

- [ ] **Step 4: Overflow `addFragmentsLocal` into the pool instead of dropping**

Replace `addFragmentsLocal` (~line 6500) so leftover beyond the item cap banks to the pool and it reports the split:

```js
  function addFragmentsLocal(itemId, amount) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { toFocus: 0, toPool: 0 };
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return { toFocus: 0, toPool: 0 };
    const d = _migrateEconomy(loadShopData());
    const current = Math.max(0, Math.floor(Number(d.fragments[itemId]) || 0));
    const next = Math.min(meta.fragments, current + add);
    const toFocus = next - current;
    const toPool = add - toFocus;
    d.fragments[itemId] = next;
    d.pooledFragments += toPool;
    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.refreshVisible) Shop.refreshVisible();
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return { toFocus, toPool };
  }
```

> This changes `addFragmentsLocal`'s return type from a number to `{ toFocus, toPool }`. The only caller is `_awardFragments` (Step 6), updated below. Confirm with `grep -n "addFragmentsLocal" public/game/game.js` that no other caller reads the numeric return.

- [ ] **Step 5: Show the pool in `renderFocusStrip`**

Requires a DOM node for the pool line. Confirm/add an element `menu-focus-pool` in the focus strip. Check the shell markup: `grep -rn "menu-focus-strip\|menu-focus-progress" src/components/Game.tsx src/app`. If a `menu-focus-pool` element does not exist, add one inside the focus strip container in the same file that defines `menu-focus-progress`, e.g. `<span id="menu-focus-pool" class="menu-focus-pool"></span>`.

Replace `renderFocusStrip` (~line 6921):

```js
  function renderFocusStrip() {
    const strip = document.getElementById('menu-focus-strip');
    const title = document.getElementById('menu-focus-title');
    const progress = document.getElementById('menu-focus-progress');
    const fill = document.getElementById('menu-focus-fill');
    const poolEl = document.getElementById('menu-focus-pool');
    if (!strip || !title || !progress || !fill) return;

    const pooled = getPooledFragments();
    if (poolEl) poolEl.textContent = pooled > 0 ? `Pool: ${pooled}` : '';

    const focusId = getFocusItem();
    if (!focusId) {
      strip.classList.add('hidden');
      return;
    }

    const status = getCraftStatus(focusId);
    if (!status.valid || status.owned) {
      strip.classList.add('hidden');
      return;
    }

    strip.classList.remove('hidden');
    title.textContent = status.name;
    progress.textContent = `${status.fragments}/${status.target}`;
    fill.style.width = `${status.pct}%`;
  }
```

> Design note: the strip still hides when there is no focus. Banked pool with no focus is surfaced on the spin result card (Step 7) and inside the shop craft UI; a persistent "no-focus pool" banner is out of scope for this plan.

- [ ] **Step 6: Route the client reward fallback into the pool**

Replace `_awardFragments` (~line 7441) — the offline/no-wallet path — so overflow banks to the pool, never coins:

```js
  function _awardFragments(amount) {
    const fragments = Math.max(0, Math.floor(Number(amount) || 0));
    if (!fragments) return { awarded: 0, fragmentsPooled: 0 };
    if (typeof Shop === 'undefined' || !Shop.addFragmentsLocal) {
      return { awarded: 0, fragmentsPooled: fragments };
    }
    const focusId = Shop.getFocusItem ? Shop.getFocusItem() : null;
    if (!focusId) {
      if (Shop.bankPooledFragments) Shop.bankPooledFragments(fragments);
      return { awarded: 0, fragmentsPooled: fragments };
    }
    const split = Shop.addFragmentsLocal(focusId, fragments);
    return { awarded: split.toFocus || 0, fragmentsPooled: split.toPool || 0 };
  }
```

Add a `bankPooledFragments` helper next to `addFragmentsLocal` and export it:

```js
  function bankPooledFragments(amount) {
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return getPooledFragments();
    const d = _migrateEconomy(loadShopData());
    d.pooledFragments += add;
    saveShopDataLocal(d);
    if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
    return d.pooledFragments;
  }
```

(Add `bankPooledFragments,` to the Shop module return object near `getPooledFragments,`.)

Update `applyBundleLocal` (~line 7480) to use the new field names:

```js
  function applyBundleLocal(bundle, source = 'reward') {
    const totals = collect(bundle);
    let fragmentResult = { awarded: 0, fragmentsPooled: 0 };
    if (totals.coins) _awardCoins(totals.coins);
    if (totals.fragments) fragmentResult = _awardFragments(totals.fragments);
    if (totals.boosters) _awardBoosters(totals.boosters);
    if (totals.xp && typeof Xp !== 'undefined' && Xp.add) Xp.add(totals.xp);
    if (typeof Sound !== 'undefined' && (totals.coins || totals.fragments || totals.boosters || totals.xp)) Sound.coin();
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (source !== 'server-spin') _syncCoins();
    return {
      ...totals,
      coins: totals.coins,
      fragmentsAwarded: fragmentResult.awarded,
      fragmentsPooled: fragmentResult.fragmentsPooled,
      label: label(bundle),
      shortLabel: shortLabel(bundle),
    };
  }
```

- [ ] **Step 7: Update the spin prize display + `_applyPrize` fields**

In `_applyPrize` (~lines 8507–8516) replace the `fragments`/`crate` blocks' field assignments:

```js
    } else if (prize.type === 'fragments' || prize.type === 'fragment_burst') {
      const result = RewardEconomy.applyBundleLocal({ fragments: Number(prize.value) || 0 }, 'spin');
      prize.fragmentsAwarded = result.fragmentsAwarded || 0;
      prize.fragmentsPooled = result.fragmentsPooled || 0;
    } else if (prize.type === 'crate') {
      const result = RewardEconomy.applyBundleLocal({ container: String(prize.value) }, 'spin');
      prize.fragmentsAwarded = result.fragmentsAwarded || 0;
      prize.fragmentsPooled = result.fragmentsPooled || 0;
    } else if (prize.type === 'xp') {
```

In the result-card rendering (~lines 8551–8563) replace the overflow copy with pool copy:

```js
      } else if (_prize.type === 'fragments' || _prize.type === 'fragment_burst') {
        iconEl.innerHTML = IMG('/game/ui-icons/fragments.png', '56px');
        const awarded = Number(_prize.fragmentsAwarded || 0);
        const pooled = Number(_prize.fragmentsPooled || 0);
        const total = awarded + pooled || Number(_prize.value || 0);
        labelEl.innerHTML = awarded <= 0 && pooled > 0
          ? `${RewardEconomy.currencyHtml('fragments', pooled, 'Focus fragments')} <span class="reward-overflow">→ Pool</span>`
          : `${RewardEconomy.currencyHtml('fragments', total, 'Focus fragments')}${pooled > 0 ? ` <span class="reward-overflow">${pooled} → Pool</span>` : ''}`;
      } else if (_prize.type === 'crate') {
        iconEl.innerHTML = IMG('/game/ui-icons/starter-pack.png', '56px');
        const pooled = Number(_prize.fragmentsPooled || 0);
        labelEl.innerHTML = pooled > 0
          ? `${_escapeHtml(_prize.label || 'Crate')} <span class="reward-overflow">${pooled} → Pool</span>`
          : _escapeHtml(_prize.label || 'Reward crate!');
```

- [ ] **Step 8: Remove client coin-fallback leftovers**

Run: `grep -n "fragmentsOverflowed\|fallbackCoins\|FRAGMENT_FALLBACK_COINS\|overflowCoins" public/game/game.js`
Remove/replace every remaining hit (e.g. a client `FRAGMENT_FALLBACK_COINS` const and `overflowCoins`/`_awardCoins`-on-fragments usage that Steps 6–7 didn't already delete). Fragments must never mint coins on the client.

- [ ] **Step 9: Commit**

```bash
git add public/game/game.js src/components/Game.tsx
git commit -m "feat(economy): client mirrors fragment pool + drain, drops coin fallback"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all economy unit tests**

Run: `node --test --experimental-strip-types src/lib/economy/config.test.ts src/lib/economy/core.pool.test.ts src/lib/economy/rewards.pool.test.ts`
Expected: all pass, 0 fail.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npm run build`
Expected: no type errors, no lint errors, successful build.

- [ ] **Step 3: Manual preview check (no-focus spin)**

Start dev server (`npm run dev`), open the game, ensure no focus item is set, and spin until a fragment prize lands. Confirm:
- The result card says "N Focus fragments → Pool" (no coin gain).
- The coin HUD does not increase from the fragment prize.
- The focus strip shows `Pool: N` (menu view).

- [ ] **Step 4: Manual preview check (set focus drains pool)**

Set a rare/epic focus item in the shop. Confirm the pooled fragments pour into it (progress jumps by up to the pool amount). Then set a legendary focus with a large pool and confirm it only fills to 50% of the requirement.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(economy): verify fragment pool end-to-end"
```
