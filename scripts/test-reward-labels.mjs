import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const gameRuntime = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');

const currencyFormatter = gameRuntime.match(
  /function currencyHtml\([^)]*\) \{[\s\S]*?\n  \}/,
)?.[0] || '';

assert.ok(currencyFormatter, 'reward currency formatter should exist');
assert.doesNotMatch(
  currencyFormatter,
  /labelText|reward-inline-label/,
  'currency rewards should render only their icon and numeric amount',
);
assert.doesNotMatch(
  gameRuntime,
  /currencyHtml\((?:'coins'|'fragments'),[^\n]*,\s*['"]/,
  'currency reward call sites should not append duplicate text labels',
);
assert.doesNotMatch(gameRuntime, /label: 'coins'/, 'coin chips should not repeat the currency name');
assert.doesNotMatch(gameRuntime, /label: 'frags'/, 'fragment chips should not repeat the currency name');

console.log('reward label assertions passed');
