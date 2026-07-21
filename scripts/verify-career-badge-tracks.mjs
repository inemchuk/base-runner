import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('public/game/game.js', 'utf8');
const markup = readFileSync('src/components/Game.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

assert.match(markup, /id="quest-career-badge-list"/, 'Career needs a dedicated list for badge-only tracks');
assert.match(game, /const CAREER_QUEST_IDS = new Set\(\['rows', 'coins', 'games', 'record', 'elite'\]\)/, 'Badge tracks must exclude the five existing reward quest tracks');
assert.match(game, /CATS\.filter\(def => !CAREER_QUEST_IDS\.has\(def\.id\)\)/, 'Career must render every remaining badge category');
assert.match(game, /data-badge-career/, 'Career badge tracks must stay interactive');
assert.match(game, /openModal\(card\.dataset\.badgeCareer\)/, 'Career badge tracks must reuse the canonical badge claim modal');
assert.match(css, /\.quest-card-badge-track[\s\S]*?cursor: pointer/, 'Career badge tracks need a clear interactive treatment');

console.log('Career badge tracks contract verified.');
