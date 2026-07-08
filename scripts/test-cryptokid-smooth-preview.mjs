import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const frameDir = join(root, 'public/game/chars/cryptokid-smooth-preview');
const frameNames = ['idle.png', 'walk-a.png', 'walk-b.png'];

function readPngSize(path) {
  const buf = readFileSync(path);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${path} is not a PNG`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

for (const frameName of frameNames) {
  const framePath = join(frameDir, frameName);
  const size = readPngSize(framePath);
  assert.deepEqual(size, { width: 512, height: 512 }, `${frameName} must be a 512x512 game frame`);
}

const gameJs = readFileSync(join(root, 'public/game/game.js'), 'utf8');

assert.match(gameJs, /PLAYER_SPRITE_SETS/, 'renderer should define animated player sprite sets');
assert.match(gameJs, /\/game\/chars\/cryptokid\.png/, 'Crypto Kid base sprite should keep its public id');
assert.match(gameJs, /\/game\/chars\/cryptokid-smooth-preview\/idle\.png/, 'Crypto Kid idle frame should be registered');
assert.match(gameJs, /\/game\/chars\/cryptokid-smooth-preview\/walk-a\.png/, 'Crypto Kid walk A frame should be registered');
assert.match(gameJs, /\/game\/chars\/cryptokid-smooth-preview\/walk-b\.png/, 'Crypto Kid walk B frame should be registered');
assert.match(gameJs, /getPlayerFrameImage/, 'renderer should select an animation frame when drawing sprite players');
