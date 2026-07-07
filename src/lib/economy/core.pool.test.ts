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
