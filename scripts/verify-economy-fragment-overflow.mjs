import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const config = read('src/lib/economy/config.ts');
const rewards = read('src/lib/economy/rewards.ts');
const claimRoute = read('src/app/api/economy/claim/route.ts');
const spinRoute = read('src/app/api/spin/route.ts');
const telemetry = read('src/lib/economy/telemetry.ts');
const game = read('public/game/game.js');
const dailySpinHook = read('src/hooks/useDailySpin.ts');

assert.match(config, /FRAGMENT_FALLBACK_COINS\s*=\s*10/, 'fragment overflow coin rate should be canonical');

assert.match(rewards, /FRAGMENT_FALLBACK_COINS/, 'reward helper should use canonical overflow rate');
assert.match(rewards, /fragmentsOverflowed:\s*number/, 'reward summary should expose overflowed fragments explicitly');
assert.match(rewards, /ctx\.result\.fragmentsOverflowed\s*\+=\s*Math\.max\(0,\s*fragmentCount\)/, 'reward helper should count all fallback fragments as overflow');
assert.doesNotMatch(rewards, /Number\(options\.fallbackCoinsPerFragment\)\s*\|\|\s*10/, 'reward helper should not hide a hard-coded overflow rate');
assert.doesNotMatch(rewards, /universal/i, 'overflow V1 must not introduce universal fragments');

assert.match(claimRoute, /FRAGMENT_FALLBACK_COINS/, 'claim route should use canonical overflow rate');
assert.doesNotMatch(claimRoute, /fallbackCoinsPerFragment:\s*10/, 'claim route should not hard-code overflow rate');

assert.match(spinRoute, /FRAGMENT_FALLBACK_COINS/, 'spin route should use canonical overflow rate');
assert.match(spinRoute, /fragmentsOverflowed/, 'spin prize response should include overflowed fragments');
assert.doesNotMatch(spinRoute, /,\s*10\)/, 'spin route should not pass a hard-coded overflow rate');

assert.match(telemetry, /economy_fragment_overflowed/, 'telemetry should track fragment overflow separately');
assert.match(telemetry, /fragmentsOverflowed[\s\S]*economy_fragment_overflowed/, 'reward telemetry should emit overflow amount when present');

assert.match(dailySpinHook, /fragmentsOverflowed\?:\s*number/, 'daily spin hook should type overflowed fragments');
assert.match(game, /FRAGMENT_FALLBACK_COINS\s*=\s*10/, 'local game economy should use the canonical overflow rate mirror');
assert.match(game, /fragmentsOverflowed/, 'local game economy should keep overflowed fragment counts in reward summaries');
assert.match(game, /Overflow/, 'spin/check-in copy should surface overflow compensation to the player');
assert.doesNotMatch(game, /fragments \* 10|leftover \* 10/, 'local game economy should not hard-code overflow multiplication');
