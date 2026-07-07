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
