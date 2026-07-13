import assert from 'node:assert/strict';

import {
  CHECKIN_REWARDS,
  CRAFT_CONFIG,
  REWARD_CONTAINERS,
  SHOP_PURCHASES,
  SPIN_REWARD_TABLE,
  getSpinFragmentEv,
} from '../src/lib/economy/config.ts';
import {
  awardFragments,
  buyShopItem,
  craftItem,
  getCraftMeta,
  normalizeShopData,
  setFocus,
  topUpFragments,
} from '../src/lib/economy/core.ts';
import { LEVEL_REWARDS } from '../src/lib/economy/levels.ts';

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

const approvedSkinCatalog = [
  ['skin_street_runner', 'common', 150, 40],
  ['skin_default', 'rare', 800, 100],
  ['skin_3', 'rare', 750, 100],
  ['skin_6', 'rare', 800, 100],
  ['skin_9', 'rare', 850, 100],
  ['skin_10', 'rare', 900, 100],
  ['skin_2', 'epic', 1200, 300],
  ['skin_5', 'epic', 1300, 300],
  ['skin_7', 'epic', 1350, 300],
  ['skin_4', 'epic', 1400, 300],
  ['skin_11', 'epic', 1500, 300],
  ['skin_8', 'legendary', null, 500],
  ['skin_founder', 'legendary', null, 500],
  ['skin_base_king', 'legendary', null, 500],
];

for (const [itemId, tier, price, craftFee] of approvedSkinCatalog) {
  const meta = getCraftMeta(itemId);
  assert.equal(CRAFT_CONFIG[itemId].tier, tier, `${itemId} tier`);
  assert.equal(meta?.craftFee, craftFee, `${itemId} craft fee`);
  assert.equal(SHOP_PURCHASES[itemId].price, price, `${itemId} direct price`);
}

assert.equal(getCraftMeta('trail_coins')?.craftFee, 220);
assert.equal(getCraftMeta('death_dramatic')?.craftFee, 220);

assert.deepEqual(LEVEL_REWARDS[20], {
  type: 'bundle',
  value: { coins: 150, fragments: 20 },
  iconSrc: '/game/ui-icons/fragments.png',
  label: '+150 coins + 20 fragments',
});

const base = normalizeShopData({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });
const firefighterPurchase = buyShopItem(base, 'skin_9', 850);
assert.equal(firefighterPurchase.ok, true);
assert.equal(firefighterPurchase.coinsDelta, -850);
assert.equal(firefighterPurchase.state.owned.includes('skin_9'), true);

const vitalikPurchase = buyShopItem(base, 'skin_founder', 9999);
assert.equal(vitalikPurchase.ok, false);
assert.equal(vitalikPurchase.error, 'direct_buy_disabled');

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
