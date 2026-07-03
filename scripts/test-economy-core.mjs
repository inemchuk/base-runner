import assert from 'node:assert/strict';

import {
  CHECKIN_REWARDS,
  REWARD_CONTAINERS,
  SPIN_REWARD_TABLE,
  getSpinFragmentEv,
} from '../src/lib/economy/config.ts';
import {
  awardFragments,
  craftItem,
  getCraftMeta,
  normalizeShopData,
  setFocus,
  topUpFragments,
} from '../src/lib/economy/core.ts';

function sumCheckinWeek() {
  return CHECKIN_REWARDS.reduce((sum, reward) => {
    const container = reward.container ? REWARD_CONTAINERS[reward.container] : null;
    return {
      coins: sum.coins + (reward.coins || 0) + (container?.coins || 0),
      fragments: sum.fragments + (reward.fragments || 0) + (container?.fragments || 0),
      boosters: sum.boosters + (reward.boosters || 0) + (container?.boosters || 0),
      xp: sum.xp + (reward.xp || 0) + (container?.xp || 0),
    };
  }, { coins: 0, fragments: 0, boosters: 0, xp: 0 });
}

assert.deepEqual(sumCheckinWeek(), { coins: 190, fragments: 10, boosters: 5, xp: 75 });
assert.deepEqual(getSpinFragmentEv(), { base: 0.88, withCrates: 1.18 });
assert.equal(SPIN_REWARD_TABLE.reduce((sum, item) => sum + item.weight, 0), 100);
assert.equal(SPIN_REWARD_TABLE.find((item) => item.type === 'direct_cosmetic')?.weight, 2);

const rareMeta = getCraftMeta('skin_1');
assert.equal(rareMeta?.tier, 'rare');
assert.equal(rareMeta?.fragments, 20);
assert.equal(rareMeta?.craftFee, 100);
assert.equal(rareMeta?.directPriceRange?.min, 750);
assert.equal(rareMeta?.directPriceRange?.max, 900);

const base = normalizeShopData({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });
const withOwnedRare = normalizeShopData({ owned: ['skin_cryptokid', 'skin_1'], equipped: 'skin_cryptokid' });
assert.equal(setFocus(base, 'skin_8').ok, true);
assert.equal(setFocus(withOwnedRare, 'skin_1').error, 'already_owned');

const withFragments = awardFragments(base, 'skin_8', 99).state;
assert.equal(withFragments.fragments.skin_8, 60);

const topUp = topUpFragments(normalizeShopData({ fragments: { skin_1: 17 } }), 'skin_1', 500);
assert.equal(topUp.ok, true);
assert.equal(topUp.state.fragments.skin_1, 20);
assert.equal(topUp.coinsDelta, -105);

const legendaryTopUp = topUpFragments(normalizeShopData({ fragments: { skin_8: 59 } }), 'skin_8', 5000);
assert.equal(legendaryTopUp.ok, false);
assert.equal(legendaryTopUp.error, 'legendary_topup_disabled');

const crafted = craftItem(
  normalizeShopData({ fragments: { skin_8: 60 }, owned: ['skin_cryptokid'] }),
  'skin_8',
  500,
);
assert.equal(crafted.ok, true);
assert.equal(crafted.state.owned.includes('skin_8'), true);
assert.equal(crafted.coinsDelta, -500);
assert.equal(crafted.state.fragments.skin_8, 0);
assert.equal(crafted.state.focusItemId, null);
