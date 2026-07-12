import { existsSync, readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

const gameRuntime = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');

const expectedIcons = [
  'career-rows', 'career-coins', 'career-games', 'career-record', 'career-elite',
  'daily-games', 'daily-rows', 'daily-coins', 'daily-quality', 'daily-score',
  'weekly-games', 'weekly-rows', 'weekly-coins', 'weekly-quality', 'weekly-score',
].map((name) => `/game/ui-icons/quests/${name}.png`);

const iconPaths = expectedIcons.filter((path) => gameRuntime.includes(`iconSrc: '${path}'`));
assert.equal(iconPaths.length, expectedIcons.length, 'every quest definition should use its generated icon');
assert.equal(new Set(iconPaths).size, expectedIcons.length, 'quest icons should be unique per quest');

for (const path of expectedIcons) {
  const localPath = new URL(`../public${path}`, import.meta.url);
  assert.ok(existsSync(localPath), `quest icon should exist: ${path}`);
  assert.ok(statSync(localPath).size > 1000, `quest icon should not be empty: ${path}`);
}

console.log('quest icon assertions passed');
