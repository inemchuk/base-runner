import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/game/game.js', 'utf8');
const economyStart = source.indexOf('const RewardEconomy = (() => {');
const economyEnd = source.indexOf('/* ===== quests.js ===== */', economyStart);
assert.notEqual(economyStart, -1, 'RewardEconomy should exist');
assert.notEqual(economyEnd, -1, 'RewardEconomy should have a closing section');

const economy = source.slice(economyStart, economyEnd);

assert.match(
  economy,
  /function xpHtml\(amount\)[\s\S]*?_uiIconHtml\('xp', 'reward-inline-icon reward-inline-icon-xp'/,
  'XP reward markup should use the shared XP icon',
);
assert.match(
  economy,
  /<span class="reward-inline-label">XP<\/span>/,
  'XP reward markup should retain an explicit XP label alongside the icon and amount',
);
assert.match(
  economy,
  /if \(totals\.xp\) parts\.push\(xpHtml\(totals\.xp\)\);/,
  'Composite reward cards should render XP through its icon-aware markup',
);
assert.doesNotMatch(
  economy,
  /_textRewardHtml\(`\+\$\{totals\.xp\} XP`\)/,
  'Composite reward cards should not fall back to text-only XP',
);

console.log('XP reward presentation checks passed');
