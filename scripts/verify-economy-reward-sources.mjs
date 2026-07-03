import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const game = read('public/game/game.js');
const spinRoute = read('src/app/api/spin/route.ts');
const dailySpinHook = read('src/hooks/useDailySpin.ts');
const css = read('src/app/globals.css');

assert.match(game, /const RewardEconomy = \(\(\) => \{/, 'game should use one reward bundle helper');
assert.match(game, /CHECKIN_REWARD_CYCLE[\s\S]*coins:\s*20[\s\S]*coins:\s*15[\s\S]*fragments:\s*2[\s\S]*container:\s*'gear_crate'/, 'check-in should use canonical mixed weekly rewards');
assert.doesNotMatch(game, /DAY_COINS\s*=\s*\[5,\s*5,\s*5,\s*10,\s*10,\s*20,\s*30\]/, 'old low-value check-in coin ladder should be removed');
assert.match(game, /quest-reward-label/, 'quest UI should render mixed reward labels');
assert.doesNotMatch(game, /30:\s*\{\s*type:\s*'skin'[\s\S]*skin_base_king/, 'level 30 should not directly unlock legendary skin');
assert.doesNotMatch(game, /35:\s*\{\s*type:\s*'trail'[\s\S]*trail_rainbow/, 'level 35 should not directly unlock legendary trail');
assert.match(game, /function _rewardChipsHtml\(bundle/, 'check-in should render reward bundles as compact chips');
assert.match(game, /ci-reward-chips/, 'check-in markup should include reward chip groups');
assert.doesNotMatch(game, /<div class="ci-day-coins">\$\{RewardEconomy\.shortLabel\(day\)\}<\/div>/, 'regular check-in cards should not render debug-like reward text');
assert.doesNotMatch(game, /<span class="ci-day-coins">\$\{RewardEconomy\.label\(day\)\}<\/span>/, 'weekly check-in card should not render long reward labels as headline text');

assert.match(spinRoute, /SPIN_PRIZES/, 'spin route should define canonical server prize pool');
assert.match(spinRoute, /direct_cosmetic[\s\S]*weight:\s*2/, 'direct cosmetic spin slot should be 2%');
assert.match(spinRoute, /pickDirectCosmetic/, 'spin direct cosmetics should be resolved server-side');
assert.doesNotMatch(spinRoute, /skin_base_king|skin_11|trail_rainbow/, 'spin pool should not directly include legendary cosmetics');
assert.doesNotMatch(spinRoute, /icon:\s*'[\u{1F300}-\u{1FAFF}]/u, 'spin API prizes should not depend on emoji icons');
assert.match(spinRoute, /sanitizeSpinId/, 'spin route should accept a narrow idempotency key');
assert.match(spinRoute, /spin_claim:\$\{addr\}:\$\{today\}:\$\{spinId\}/, 'spin route should persist claims by address, day, and spinId');
assert.match(spinRoute, /spin_lock:\$\{addr\}:\$\{today\}/, 'spin route should serialize same-day spin awards per address');
assert.match(spinRoute, /spin_pending/, 'spin route should return quickly for duplicate in-flight spin requests');
assert.match(spinRoute, /existingClaim[\s\S]*idempotent:\s*true/, 'spin route should return cached duplicate spin responses');
assert.match(spinRoute, /writeSpinClaim/, 'spin route should store the applied response after awarding');

assert.match(dailySpinHook, /createSpinId/, 'daily spin hook should create a client spinId for each visible spin');
assert.match(dailySpinHook, /pendingSpinIdRef/, 'daily spin hook should reuse the same spinId for fallback fetches');
assert.match(dailySpinHook, /JSON\.stringify\(\{\s*address:\s*addr,\s*spinId\s*\}\)/, 'daily spin hook should send spinId to the server');
assert.match(dailySpinHook, /spin_pending[\s\S]*setTimeout[\s\S]*_fetchPrize\(addr,\s*spinId,\s*retry \+ 1\)/, 'daily spin hook should retry pending duplicates client-side without server long-polling');

assert.match(css, /#btn-do-ci\s+\.ci-reward-icon-img[\s\S]*width:\s*22px[\s\S]*height:\s*22px/, 'check-in claim icon should stay compact inside the claim button');
assert.match(css, /\.ci-reward-chip[\s\S]*border:\s*1px solid rgba\(136,\s*170,\s*255,\s*0\.16\)/, 'check-in reward chips should use compact premium styling');
assert.match(css, /\.ci-day\.ci-day-final\s+\.ci-reward-chips[\s\S]*justify-content:\s*flex-start/, 'weekly check-in reward chips should align with the crate headline');
