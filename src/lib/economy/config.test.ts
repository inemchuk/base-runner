import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY_TIERS } from './config.ts';

test('poolCapPct is 1 for non-legendary tiers, 0.5 for legendary', () => {
  assert.equal(ECONOMY_TIERS.common.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.rare.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.epic.poolCapPct, 1);
  assert.equal(ECONOMY_TIERS.legendary.poolCapPct, 0.5);
});
