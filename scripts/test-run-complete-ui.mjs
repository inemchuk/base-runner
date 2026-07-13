import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gameShell = readFileSync('src/components/Game.tsx', 'utf8');
const globalCss = readFileSync('src/app/globals.css', 'utf8');

function countId(id) {
  return (gameShell.match(new RegExp(`id=["']${id}["']`, 'g')) ?? []).length;
}

function assertSingleId(id) {
  assert.equal(countId(id), 1, `Game shell should include exactly one #${id}`);
}

assertSingleId('screen-loadout');
assert.equal(countId('screen-gameover'), 0, 'Run Complete should reuse Loadout instead of a Game Over screen');
assert.equal(countId('btn-restart'), 0, 'Run Complete should use the shared blue Start action, not a red restart');
assertSingleId('btn-claim-score');

for (const id of [
  'loadout-gear',
  'loadout-skin-card',
  'loadout-trail-card',
  'loadout-boost-magnet',
  'loadout-boost-double',
  'loadout-boost-shield',
  'loadout-scroll',
  'run-complete-result',
  'loadout-title',
  'loadout-build-summary',
  'loadout-inline-message',
  'go-score',
  'go-best',
  'go-record-label',
  'go-record-state',
  'go-rating-row',
  'go-rating-label',
  'go-coins-row',
  'go-coins-earned',
  'go-xp-row',
  'go-xp-earned',
  'go-xp-multi',
  'go-xp-bonus',
  'go-quest-notify',
  'btn-loadout-start',
  'btn-loadout-back',
]) {
  assertSingleId(id);
}

assert.match(
  gameShell,
  /id="loadout-inline-message"[^>]*aria-live="polite"/,
  'Loadout should expose a polite inline status region',
);
assert.match(
  gameShell,
  /id="run-complete-result"[^>]*className="[^"]*hidden[^"]*"/,
  'Run Complete result should start hidden',
);

const scrollIndex = gameShell.indexOf('id="loadout-scroll"');
const resultIndex = gameShell.indexOf('id="run-complete-result"');
const gearIndex = gameShell.indexOf('id="loadout-gear"');
const actionsIndex = gameShell.indexOf('className="loadout-actions"');
assert.ok(
  scrollIndex < resultIndex && resultIndex < gearIndex && gearIndex < actionsIndex,
  'The one scroll body should contain the result before gear and sit before fixed actions',
);

assert.match(
  gameShell,
  /<button[^>]*id="btn-claim-score"[^>]*>[\s\S]*?CLAIM ONCHAIN[\s\S]*?<\/button>/,
  'Claim should be an accessible text button',
);
assert.match(
  gameShell,
  /<button[^>]*id="btn-loadout-start"[^>]*>[\s\S]*?START RUN[\s\S]*?<\/button>/,
  'Start should be an accessible text button',
);
assert.match(
  gameShell,
  /<button[^>]*id="btn-loadout-back"[^>]*>[\s\S]*?MENU[\s\S]*?<\/button>/,
  'Menu should be an accessible text button',
);

assert.doesNotMatch(gameShell, /type CSSProperties/, 'Loadout dimensions should live in responsive CSS');
assert.doesNotMatch(gameShell, /loadoutGear(?:Card|Arrow|Preview)Style/, 'Loadout should not use inline size objects');

assert.match(globalCss, /\.loadout-run-complete\b/, 'CSS should define the shared Run Complete mode');
assert.match(globalCss, /\.loadout-panel\s*\{[\s\S]*?width:\s*min\(360px,\s*100%\)/, 'Normal Loadout should stay at or below 360 px');
assert.match(globalCss, /\.loadout-scroll\s*\{[\s\S]*?overflow-y:\s*auto/, 'Loadout should have one scrolling body');
assert.match(globalCss, /\.loadout-screen::before\s*\{[\s\S]*?background:/, 'Loadout should render a Base navy veil');
assert.match(globalCss, /\.loadout-run-complete::before\s*\{[\s\S]*?animation:\s*runCompleteVeil 180ms/, 'Run Complete veil should fade once over 180 ms');
assert.match(globalCss, /animation:[^;]*180ms/, 'Run Complete should use a 180 ms one-shot entrance');
assert.match(globalCss, /env\(safe-area-inset-top/, 'Loadout should respect the top safe area');
assert.match(globalCss, /env\(safe-area-inset-bottom/, 'Loadout should respect the bottom safe area');
assert.match(globalCss, /@media\s*\(max-width:\s*360px\)\s*and\s*\(max-height:\s*640px\)/, 'Loadout should compact at 360 x 640');
assert.match(
  globalCss,
  /@media\s*\([^)]*orientation:\s*landscape[^)]*\)\s*and\s*\([^)]*max-height:\s*430px[^)]*\)/,
  'Loadout should compact into a short-landscape layout',
);
assert.match(
  globalCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#run-complete-result[\s\S]*?transform:\s*none/,
  'Reduced motion should remove result translation and scaling',
);
assert.doesNotMatch(globalCss, /\.btn-restart\s*\{/, 'Run Complete should not retain a red restart treatment');
assert.match(globalCss, /\.btn-claim-score\s*\{[\s\S]*?background:\s*rgba\(0,82,255,0\.06\)[\s\S]*?border-color:/, 'Claim should use an outlined Base treatment');
assert.match(globalCss, /\.btn-start\s*\{[\s\S]*?background:\s*var\(--button-blue\)/, 'Start should keep the Base blue primary treatment');
assert.match(globalCss, /\.run-complete-record-state\.hidden\s*\{\s*display:\s*none/, 'New-record state should remain hidden until the runtime reveals it');
assert.match(globalCss, /\.run-complete-result \.run-complete-quest\s*\{[\s\S]*?color:\s*#69F0AE[\s\S]*?animation:\s*none/, 'Run Complete quest should use mint without the legacy continuous pulse');

console.log('run complete UI checks passed');
