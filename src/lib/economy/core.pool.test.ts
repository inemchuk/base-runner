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
