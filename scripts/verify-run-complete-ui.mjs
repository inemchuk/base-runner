import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync('src/components/Game.tsx', 'utf8');
const game = readFileSync('public/game/game.js', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

assert.doesNotMatch(markup, /go-quest-notify/, 'Run complete must not render a duplicate quest-ready prompt');
assert.doesNotMatch(game, /go-quest-notify/, 'Run complete must not bind or render a duplicate quest-ready prompt');
assert.doesNotMatch(css, /run-complete-quest/, 'Removed run-complete quest prompt must not leave CSS behind');

assert.doesNotMatch(game, /xpBreakdown\.streakBonus\)\s+bonuses\.push/, 'The unexplained streak-fire chip must not render beside XP');
assert.match(markup, /id="go-xp-earned"/, 'The actual XP result must remain visible');
assert.match(markup, /id="loadout-goals"/, 'The existing lower quest list must remain available');

console.log('Run complete UI cleanup verified.');
