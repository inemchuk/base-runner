import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const game = readFileSync(resolve(root, 'public/game/game.js'), 'utf8');

assert.match(
  game,
  /bush:\s*\{[^}]*shadowLift:\s*0\.14[^}]*\}/,
  'bush sprite shadow should be lifted close to its visible base',
);

assert.match(
  game,
  /rock:\s*\{[^}]*shadowLift:\s*0\.12[^}]*\}/,
  'rock sprite shadow should be lifted close to its visible base',
);

assert.match(
  game,
  /const shadowY\s*=\s*baseY\s*-\s*CELL\s*\*\s*\(cfg\.shadowLift\s*\|\|\s*0\)/,
  'environment sprite shadows should use shadowLift without moving the sprite',
);

assert.match(
  game,
  /ctx\.ellipse\(cx,\s*shadowY,\s*CELL\s*\*\s*cfg\.sw,\s*CELL\s*\*\s*cfg\.sh,\s*0,\s*0,\s*Math\.PI\s*\*\s*2\)/,
  'environment sprite shadow ellipse should render at shadowY',
);
