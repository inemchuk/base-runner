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
