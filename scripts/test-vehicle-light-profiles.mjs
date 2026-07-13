import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('public/game/game.js', 'utf8');
const ids = [
  'taxi', 'yellow_taxi', 'green_taxi', 'orange', 'police',
  'ambulance', 'truck', 'bus', 'firetruck',
  'black_suv', 'blue_hatchback', 'white_panel_van',
  'silver_minivan', 'orange_pickup',
];

assert.match(game, /const _CAR_LIGHT_PROFILES = Object\.freeze\(\{/);
assert.doesNotMatch(game, /const _CAR_LIGHT_MAP =/);

for (const id of ids) {
  assert.match(
    game,
    new RegExp(`\\n\\s{4}${id}:\\s+_lightProfile\\(`),
    `${id} should have a calibrated light profile`,
  );
}

assert.match(game, /const profile = _CAR_LIGHT_PROFILES\[imageKey\] \|\| _DEFAULT_CAR_LIGHT_PROFILE/);
assert.doesNotMatch(game, /_CAR_LIGHT_MAP/);
assert.match(game, /function _lightPointToCanvas\(point, facingRight, x, y, width, height\)/);
assert.match(game, /const frontLights = profile\.front\.map\(point => _lightPointToCanvas/);
assert.match(game, /const rearLights = profile\.rear\.map\(point => _lightPointToCanvas/);
assert.match(game, /beamOriginX = beamMidX \+ direction \* car\.width \* profile\.beam\.offset/);
assert.match(game, /ctx\.globalCompositeOperation = 'screen'/);
assert.match(game, /const glowR = CELL \* profile\.halo\.head/);
assert.match(game, /const glowR = CELL \* profile\.halo\.tail/);

console.log('vehicle light profile assertions passed');
