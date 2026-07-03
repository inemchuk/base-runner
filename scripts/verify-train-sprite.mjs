import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const game = readFileSync(resolve(root, 'public/game/game.js'), 'utf8');
const spritePath = resolve(root, 'public/game/vehicles/train-base-arcade-topdown-trimmed.png');

assert.ok(existsSync(spritePath), 'trimmed top-down train sprite should exist');

assert.match(
  game,
  /const TRAIN_SPRITE_SRC\s*=\s*'\/game\/vehicles\/train-base-arcade-topdown-trimmed\.png'/,
  'renderer should reference the trimmed top-down train sprite',
);

assert.match(
  game,
  /function loadTrainSprite\(\)/,
  'renderer should preload the train sprite',
);

assert.match(
  game,
  /loadEnvSprites\(\);[\s\S]*loadTrainSprite\(\);[\s\S]*loadGrassTextures\(\);/,
  'renderer init should call loadTrainSprite',
);

assert.match(
  game,
  /function drawTrainSprite\(train,\s*rowY,\s*dir\)/,
  'renderer should isolate sprite drawing in drawTrainSprite',
);

assert.match(
  game,
  /ctx\.drawImage\(_trainSpriteImg,\s*-drawW \/ 2,\s*-drawH \/ 2,\s*drawW,\s*drawH\)/,
  'train sprite should be drawn centered at the obstacle hitbox',
);

assert.match(
  game,
  /drawTrainFallback\(train,\s*rowY,\s*dir\)/,
  'old procedural train should remain as fallback while the image is loading',
);
