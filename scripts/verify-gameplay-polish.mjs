import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync('public/game/game.js', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

assert.match(game, /const LOG_SUPPORT_INSET = PLAYER_RADIUS \* 0\.75;/, 'Log support needs a visible-footing inset');
assert.match(game, /function isSupportedByLog\(playerX, log\)/, 'Water collision needs dedicated log-support geometry');
assert.match(game, /isSupportedByLog\(ps\.visualX, log\)/, 'Water collision must use strict support geometry instead of edge overlap');

assert.doesNotMatch(game, /ctx\.fillRect\(x, y, car\.width, car\.height\);/, 'Siren flash must never tint the entire car as a rectangle');
assert.match(game, /function drawSirenBeacon\(/, 'Siren flash needs a beacon-local rendering helper');

assert.doesNotMatch(game, /fxs\.hlDot/, 'Headlights must not use bright white dot overlays');
assert.match(game, /blue_hatchback:\s+_lightProfile\(\[\[0\.955, 0\.220\], \[0\.955, 0\.780\]\]/, 'Blue hatchback headlights need anchors at the nose');
assert.match(game, /black_suv:\s+_lightProfile\(\[\[0\.955, 0\.220\], \[0\.955, 0\.780\]\]/, 'SUV headlights need anchors at the nose');

assert.match(game, /let\s+_recordSoundPlayed\s*=\s*false;/, 'Record fanfare needs per-run state');
assert.match(game, /function resetRunRecordFeedback\(\)/, 'A new run must reset record feedback state');
assert.match(game, /if \(!_recordSoundPlayed && typeof Sound !== 'undefined'\) \{\s*Sound\.newRecord\(\);\s*_recordSoundPlayed = true;/, 'Record fanfare must play once per run');
assert.match(game, /UI\.resetRunRecordFeedback\(\);/, 'Run initialization must reset record fanfare state');

assert.match(css, /@keyframes recordNumberPulse/, 'Record feedback needs a text-only animation');
assert.match(css, /#score-box\.record-beat \.score-val-num/, 'Record feedback must target the STEPS value only');
assert.doesNotMatch(css, /#score-combined\.record-beat/, 'HUD rail must not receive a rectangular record pulse');

console.log('Gameplay polish contracts verified.');
