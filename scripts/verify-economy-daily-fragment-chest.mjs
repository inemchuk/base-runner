import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const config = read('src/lib/economy/config.ts');
const core = read('src/lib/economy/core.ts');
const storage = read('src/lib/economy/storage.ts');
const economyRoute = read('src/app/api/economy/route.ts');
const hook = read('src/hooks/useEconomySync.ts');
const game = read('public/game/game.js');
const css = read('src/app/globals.css');

assert.match(config, /DAILY_FRAGMENT_CHEST[\s\S]*cost:\s*90[\s\S]*fragments:\s*3[\s\S]*limitPerDay:\s*1/, 'daily fragment chest should have canonical V1 cost, reward, and daily limit');

assert.match(core, /export function buyDailyFragmentChest/, 'economy core should expose a server-safe daily fragment chest mutator');
assert.match(core, /buyDailyFragmentChest[\s\S]*focusItemId/, 'daily fragment chest should require a selected focus item');
assert.match(core, /buyDailyFragmentChest[\s\S]*already_ready/, 'daily fragment chest should reject ready focus items instead of converting fragments');
assert.match(core, /buyDailyFragmentChest[\s\S]*not_enough_coins/, 'daily fragment chest should enforce the 90 coin spend');
assert.match(core, /buyDailyFragmentChest[\s\S]*awardFragments/, 'daily fragment chest should award focus fragments through core fragment caps');

assert.match(storage, /EconomyDailyFragmentChestState/, 'storage should define daily fragment chest state');
assert.match(storage, /readDailyFragmentChestState/, 'storage should read daily fragment chest state');
assert.match(storage, /writeDailyFragmentChestState/, 'storage should write daily fragment chest state');
assert.match(storage, /economy_daily_fragment_chest:\$\{addr\}/, 'daily fragment chest state should use its own Redis key');

assert.match(economyRoute, /action !== 'dailyFragmentChest' && !itemId/, 'daily fragment chest action should not require an itemId');
assert.match(economyRoute, /action === 'dailyFragmentChest'/, 'economy route should support dailyFragmentChest');
assert.match(economyRoute, /readDailyFragmentChestState/, 'economy route should read duplicate-protection state');
assert.match(economyRoute, /writeDailyFragmentChestState/, 'economy route should persist duplicate-protection state');
assert.match(economyRoute, /daily_chest_claimed/, 'economy route should reject second buy on the same day');
assert.match(economyRoute, /economy_coin_spent[\s\S]*daily_fragment_chest/, 'daily fragment chest should emit coin sink telemetry');
assert.match(economyRoute, /economy_fragment_earned[\s\S]*daily_fragment_chest/, 'daily fragment chest should emit fragment source telemetry');
assert.doesNotMatch(economyRoute, /dailyFragmentChest[\s\S]*applyRewardBundle/, 'daily fragment chest must not convert missing/no-focus fragments to coins');

assert.match(hook, /'dailyFragmentChest'/, 'client economy bridge should allow dailyFragmentChest action');
assert.match(hook, /itemId\?:\s*string/, 'daily fragment chest bridge action should allow actions without itemId');

assert.match(game, /DAILY_FRAGMENT_CHEST_COST\s*=\s*90/, 'game UI should use canonical daily chest cost');
assert.match(game, /DAILY_FRAGMENT_CHEST_FRAGMENTS\s*=\s*3/, 'game UI should use canonical daily chest fragment amount');
assert.match(game, /function buyDailyFragmentChestLocal/, 'game should keep a local-only fallback for daily chest in development/no-wallet mode');
assert.match(game, /_runEconomyAction\('dailyFragmentChest'/, 'game should prefer the server action for daily chest buys');
assert.match(game, /daily-fragment-chest/, 'shop should render the daily fragment chest card');
assert.match(game, /shop-btn-daily-chest/, 'shop should bind a daily fragment chest buy button');

assert.match(css, /\.daily-fragment-chest/, 'daily fragment chest card should have dedicated shop styling');
assert.match(css, /\.shop-btn-daily-chest/, 'daily fragment chest buy button should have dedicated styling');
