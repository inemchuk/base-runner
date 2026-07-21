import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const markup = readFileSync('src/components/Game.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
const game = readFileSync('public/game/game.js', 'utf8');
const i18n = readFileSync('public/game/i18n.js', 'utf8');

const spinIcons = [
  'spin-wheel.png',
  'spin-fragments.png',
  'spin-xp.png',
  'spin-boost.png',
  'spin-gear.png',
  'spin-crate.png',
  'spin-empty.png',
];

assert.match(markup, /className="spin-header"/, 'Spin must use the focused screen header instead of inline title styling');
assert.match(markup, /data-i18n="spin\.title"/, 'Spin title must be localizable');
assert.match(markup, /className="spin-nft-action hidden"/, 'NFT action must be a sibling of the result strip');
assert.match(i18n, /'spin\.title': 'DAILY SPIN'/, 'English spin title is required');
assert.match(i18n, /'spin\.title': 'КОЛЕСО ДНЯ'/, 'Russian spin title is required');
assert.match(game, /\/game\/ui-icons\/spin\/spin-wheel\.png/, 'Wheel must use the unified daily-spin icon');
assert.match(game, /\/game\/ui-icons\/spin\/spin-fragments\.png/, 'Wheel must use the unified fragment icon');
assert.match(game, /const CONFETTI_COUNTS = \{ common: 0, uncommon: 8, rare: 14, epic: 24, legendary: 32 \}/, 'Celebration must keep common rewards quiet');
assert.match(css, /\.spin-prize-card \{[\s\S]*?border-radius: 8px;/, 'Result strip must share the compact 8px surface radius');
assert.match(css, /\.spin-rays-burst/, 'Top-rarity rays must be a one-shot burst');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?spin-rays-burst/, 'Spin effects must respect reduced motion');
assert.doesNotMatch(css, /spinRaysRotate 14s linear infinite/, 'Spin rays must not loop indefinitely');

for (const icon of spinIcons) {
  assert.ok(existsSync(`public/game/ui-icons/spin/${icon}`), `Missing spin UI icon: ${icon}`);
}

console.log('Daily Spin UI contract verified.');
