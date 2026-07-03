import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  return readFileSync(path, 'utf8');
}

const telemetry = read('src/lib/economy/telemetry.ts');
const economyRoute = read('src/app/api/economy/route.ts');
const claimRoute = read('src/app/api/economy/claim/route.ts');
const spinRoute = read('src/app/api/spin/route.ts');

assert.match(telemetry, /export type EconomyTelemetryEventName/, 'telemetry helper should define canonical event names');
assert.match(telemetry, /economy_focus_set/, 'telemetry should include focus set event');
assert.match(telemetry, /economy_fragment_earned/, 'telemetry should include fragment earned event');
assert.match(telemetry, /economy_reward_claimed/, 'telemetry should include generic reward claimed event');
assert.match(telemetry, /economy_coin_earned/, 'telemetry should include coin earned event');
assert.match(telemetry, /economy_coin_spent/, 'telemetry should include coin spent event');
assert.match(telemetry, /economy_booster_acquired/, 'telemetry should include booster acquired event');
assert.match(telemetry, /economy_craft_completed/, 'telemetry should include craft completed event');
assert.match(telemetry, /economy_spin_result/, 'telemetry should include spin result event');
assert.match(telemetry, /economy_checkin_claimed/, 'telemetry should include check-in claim event');
assert.match(telemetry, /economy_quest_claimed/, 'telemetry should include quest claim event');
assert.match(telemetry, /economy_level_reward_claimed/, 'telemetry should include level claim event');
assert.match(telemetry, /after\(/, 'telemetry should schedule writes after the response');
assert.match(telemetry, /trackEconomyEventAfter/, 'telemetry should expose a non-blocking route helper');
assert.match(telemetry, /economy_events:\$\{date\}/, 'telemetry should write events into date-partitioned keys');
assert.match(telemetry, /catch[\s\S]*console\.warn/, 'telemetry failures should be swallowed and warned, not break claims');

assert.match(economyRoute, /trackEconomyEventAfter/, 'economy mutation route should emit telemetry');
assert.match(economyRoute, /economy_focus_set/, 'focus set should be tracked');
assert.match(economyRoute, /economy_coin_spent/, 'coin spending should be tracked');
assert.match(economyRoute, /economy_craft_completed/, 'craft completion should be tracked');

assert.match(claimRoute, /trackRewardBundleTelemetryAfter/, 'claim route should emit reward bundle telemetry');
assert.match(claimRoute, /economy_checkin_claimed/, 'check-in claims should be tracked');
assert.match(claimRoute, /economy_quest_claimed/, 'quest claims should be tracked');
assert.match(claimRoute, /economy_level_reward_claimed/, 'level claims should be tracked');

assert.match(spinRoute, /trackRewardBundleTelemetryAfter/, 'spin route should emit reward telemetry');
assert.match(spinRoute, /economy_spin_result/, 'spin result should be tracked');
assert.match(spinRoute, /idempotent:\s*true[\s\S]*return NextResponse\.json/, 'idempotent spin replays should return before new telemetry');
