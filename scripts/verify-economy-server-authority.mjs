import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const shopRoute = read('src/app/api/shop/route.ts');
const coinSyncRoute = read('src/app/api/coins/sync/route.ts');
const config = read('src/lib/economy/config.ts');
const core = read('src/lib/economy/core.ts');

assert.match(config, /rare:[\s\S]*directPriceRange:\s*\{\s*min:\s*750,\s*max:\s*900\s*\}/, 'rare direct price should protect fragment-first progression');
assert.match(config, /gear_crate:\s*\{\s*coins:\s*50,\s*fragments:\s*5,\s*boosters:\s*3\s*\}/, 'Gear Crate should use canonical EV');
assert.match(core, /legendary_topup_disabled/, 'legendary top-up should be disabled in V1');

assert.match(read('src/lib/economy/storage.ts'), /export async function readShop/, 'storage should expose readShop');
assert.match(read('src/lib/economy/storage.ts'), /export async function writeCoins/, 'storage should expose writeCoins');
assert.match(shopRoute, /mergeClientShop/, 'shop POST should merge through server storage');
assert.doesNotMatch(shopRoute, /body\.fragments|body\.focusItemId|body\.topUpFragments/, 'shop POST must not trust economy fields');
assert.match(coinSyncRoute, /writeCoins/, 'coin sync should share economy coin storage');

const economyRoute = read('src/app/api/economy/route.ts');
assert.match(economyRoute, /action === 'setFocus'/, 'economy route should support setFocus');
assert.match(economyRoute, /action === 'topUp'/, 'economy route should support topUp');
assert.match(economyRoute, /action === 'craft'/, 'economy route should support craft');
assert.doesNotMatch(economyRoute, /action === 'awardFragments'/, 'public API must not expose arbitrary fragment grants');

assert.match(read('src/components/Game.tsx'), /useEconomySync\(\)/, 'Game should install economy bridge hook');
assert.match(read('src/hooks/useEconomySync.ts'), /__BASE_ECONOMY_ACTION/, 'client hook should expose economy action bridge');
assert.match(read('public/game/game.js'), /applyServerEconomyData/, 'Shop should hydrate server economy data');
assert.match(read('public/game/game.js'), /__BASE_ECONOMY_ACTION/, 'Shop economy buttons should prefer server-authoritative actions');
