import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const config = read('src/lib/economy/config.ts');
const core = read('src/lib/economy/core.ts');
const economyRoute = read('src/app/api/economy/route.ts');
const hook = read('src/hooks/useEconomySync.ts');
const game = read('public/game/game.js');

assert.match(config, /SHOP_PURCHASES[\s\S]*skin_1:\s*\{\s*type:\s*'skin',\s*price:\s*750\s*\}/, 'server catalog should own rare direct-buy pricing');
assert.match(config, /SHOP_PURCHASES[\s\S]*skin_8:\s*\{\s*type:\s*'skin',\s*price:\s*null\s*\}/, 'server catalog should disable direct legendary buys');
assert.match(config, /BOOSTER_PACKS[\s\S]*boost_magnet:\s*\{\s*price:\s*60,\s*size:\s*3\s*\}[\s\S]*boost_shield:\s*\{\s*price:\s*100,\s*size:\s*3\s*\}/, 'server catalog should own booster pack price and size');

assert.match(core, /export function buyShopItem/, 'economy core should expose server-safe item purchase mutator');
assert.match(core, /buyShopItem[\s\S]*SHOP_PURCHASES/, 'item purchase should use server catalog');
assert.match(core, /buyShopItem[\s\S]*direct_buy_disabled/, 'item purchase should reject fragment-only cosmetics');
assert.match(core, /buyShopItem[\s\S]*not_enough_coins/, 'item purchase should enforce server-side coin balance');
assert.match(core, /buyShopItem[\s\S]*grantItem/, 'item purchase should grant through shared inventory helper');
assert.match(core, /export function buyBoosterPack/, 'economy core should expose server-safe booster pack mutator');
assert.match(core, /buyBoosterPack[\s\S]*BOOSTER_PACKS/, 'booster purchase should use server catalog');
assert.match(core, /buyBoosterPack[\s\S]*boosterCharges/, 'booster purchase should mutate server booster charges');

assert.match(economyRoute, /action === 'buyItem'/, 'economy route should support buyItem');
assert.match(economyRoute, /action === 'buyBoosterPack'/, 'economy route should support buyBoosterPack');
assert.match(economyRoute, /buyShopItem\(shop,\s*itemId as string,\s*coins\)/, 'buyItem route should pass only server state and itemId');
assert.match(economyRoute, /buyBoosterPack\(shop,\s*itemId as string,\s*coins\)/, 'buyBoosterPack route should pass only server state and booster id');
assert.doesNotMatch(economyRoute, /body\.price|body\.packPrice|body\.packSize|body\.size/, 'economy route must not trust client prices or pack sizes');
assert.match(economyRoute, /economy_shop_item_purchased/, 'item purchase should emit purchase telemetry');
assert.match(economyRoute, /economy_booster_pack_purchased/, 'booster purchase should emit purchase telemetry');

assert.match(hook, /'buyItem'/, 'client economy bridge should allow buyItem action');
assert.match(hook, /'buyBoosterPack'/, 'client economy bridge should allow buyBoosterPack action');

assert.match(game, /function buyShopItemServerFirst/, 'shop UI should route direct item buys through server-first helper');
assert.match(game, /function buyBoosterPackServerFirst/, 'shop UI should route booster buys through server-first helper');
assert.match(game, /_runEconomyAction\('buyItem'/, 'game should call server economy action for item buys');
assert.match(game, /_runEconomyAction\('buyBoosterPack'/, 'game should call server economy action for booster packs');
assert.match(game, /no_address[\s\S]*localFallback/, 'server-first helper should keep local fallback for disconnected local testing');
assert.match(game, /Craft only/, 'legendary direct-buy cards should show fragment-only state instead of coin buy');
assert.match(game, /skin_1',\s+name:\s+'Neon Runner',\s+price:\s+750/, 'client shop UI should mirror canonical rare pricing');
