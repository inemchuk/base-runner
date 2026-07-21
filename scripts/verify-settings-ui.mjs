import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync('src/components/Game.tsx', 'utf8');
const game = readFileSync('public/game/game.js', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

assert.doesNotMatch(markup, /settings-lang-btn|settings\.language/, 'Settings must not render a language selector');
assert.doesNotMatch(game, /settings-lang-btn|_syncLangBtn/, 'Settings must not bind a language selector');
assert.doesNotMatch(css, /settings-lang-(?:icon|btn)/, 'Unused language selector styles must be removed');

console.log('Settings language selector removal verified.');
