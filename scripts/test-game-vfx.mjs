import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const gameRuntime = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const moduleStart = gameRuntime.indexOf('const GameVfx = (() => {');
const rendererStart = gameRuntime.indexOf('/* ===== renderer.js ===== */');

assert.notEqual(moduleStart, -1, 'GameVfx module should exist');
assert.ok(rendererStart > moduleStart, 'GameVfx should load before Renderer');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  `${gameRuntime.slice(moduleStart, rendererStart)}\nthis.__GAME_VFX__ = GameVfx;`,
  sandbox,
);

const vfx = sandbox.__GAME_VFX__;
assert.ok(vfx, 'GameVfx should be extractable without DOM globals');

const surfaceCases = [
  [{ rowType: 'grass', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'grass'],
  [{ rowType: 'grass', biome: 'desert', weatherState: 0, weatherRatio: 0 }, 'sand'],
  [{ rowType: 'grass', biome: 'snow', weatherState: 0, weatherRatio: 0 }, 'snow'],
  [{ rowType: 'road', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'dryRoad'],
  [{ rowType: 'road', biome: 'default', weatherState: 1, weatherRatio: 0.8 }, 'wetRoad'],
  [{ rowType: 'road', biome: 'desert', weatherState: 3, weatherRatio: 1 }, 'dryRoad'],
  [{ rowType: 'water', biome: 'snow', weatherState: 0, weatherRatio: 0 }, 'water'],
  [{ rowType: 'train', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'railBed'],
];

for (const [input, expected] of surfaceCases) {
  assert.equal(vfx.resolveSurface(input).id, expected, JSON.stringify(input));
}

assert.equal(vfx.getLanding('snow').kind, 'snow');
assert.equal(vfx.getLanding('wetRoad').kind, 'splash');
assert.equal(vfx.getSurface('missing').id, 'neutral');
assert.ok(vfx.priorityOf('impact') > vfx.priorityOf('ambient'));

const pool = vfx.createPool(2);
assert.ok(pool.spawn({ id: 'rain' }, 'ambient'));
assert.ok(pool.spawn({ id: 'dust' }, 'contact'));
assert.equal(pool.spawn({ id: 'extra' }, 'ambient'), null, 'low priority should be dropped');
assert.ok(pool.spawn({ id: 'hit' }, 'impact'), 'impact should replace a lower priority item');
assert.equal(pool.stats().active, 2);
pool.releaseAt(0);
assert.equal(pool.stats().active, 1);
pool.clear();
assert.equal(pool.stats().active, 0);

assert.match(gameRuntime, /function _surfaceForRow\(row\)/);
assert.match(gameRuntime, /function _buildSurfaceTile\(surfaceId\)/);
assert.match(gameRuntime, /function _drawSurfaceTexture\(row, y\)/);
assert.match(gameRuntime, /_drawSurfaceTexture\(row, y\);/);
assert.doesNotMatch(gameRuntime, /ctx\.filter\s*=\s*['"]blur/);

assert.match(gameRuntime, /function drawGroundShadow\(x, y, width, height, options = \{\}\)/);
assert.match(gameRuntime, /const _shadowSpriteCache = new Map\(\)/);

for (const functionName of ['drawEnvSprite', 'drawCars', 'drawLogs', 'drawTrainSprite', 'drawPlayer']) {
  const start = gameRuntime.indexOf(`function ${functionName}`);
  const end = gameRuntime.indexOf('\n  function ', start + 1);
  assert.ok(start >= 0, `${functionName} should exist`);
  assert.match(gameRuntime.slice(start, end === -1 ? undefined : end), /drawGroundShadow\(/, `${functionName} should use ground shadows`);
}

assert.match(gameRuntime, /function addLandingEffect\(x, y, rowIdx\)/);
assert.match(gameRuntime, /Renderer\.addLandingEffect\(state\.visualX, state\.visualY, state\.row\)/);
assert.match(gameRuntime, /function drawPhysicalTrails\(\)/);
assert.match(gameRuntime, /function drawLogWake\(log, rowY\)/);
assert.match(gameRuntime, /function drawPropContact\(type, cx, baseY, surfaceId\)/);
assert.match(gameRuntime, /function drawVehicleContact\(row, rowY, car\)/);
assert.match(gameRuntime, /function drawTrainContact\(train, rowY, dir\)/);

assert.match(gameRuntime, /function drawWeatherFar\(W, H\)/);
assert.match(gameRuntime, /function drawWeatherNear\(W, H\)/);
assert.match(gameRuntime, /function drawWorldEmissive\(\)/);
assert.match(gameRuntime, /function drawCarLights\(row, rowY, car\)/);

const drawStart = gameRuntime.indexOf('function draw(dt)');
const drawEnd = gameRuntime.indexOf('// ── Stars', drawStart);
const drawBody = gameRuntime.slice(drawStart, drawEnd);
assert.ok(drawBody.indexOf('drawWeatherFar(W, H)') < drawBody.indexOf('drawRows()'));
assert.ok(drawBody.indexOf('drawWorldEmissive()') > drawBody.indexOf('Night overlay'));
assert.ok(drawBody.indexOf('drawWeatherNear(W, H)') > drawBody.indexOf('drawWorldEmissive()'));

console.log('game VFX assertions passed');
