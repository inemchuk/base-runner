import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/components/Game.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

for (const [screen, homeButton, nextScreen] of [
  ['screen-profile', 'btn-home-profile', 'screen-continue'],
  ['screen-shop', 'btn-home-shop', 'screen-quests'],
  ['screen-quests', 'btn-home-quests', 'screen-settings'],
  ['screen-lb', 'btn-home-lb', 'screen-shop'],
]) {
  const screenStart = shell.indexOf(`id="${screen}"`);
  const screenEnd = shell.indexOf(`id="${nextScreen}"`, screenStart);
  const section = shell.slice(screenStart, screenEnd);

  assert.notEqual(screenStart, -1, `${screen} should exist`);
  assert.notEqual(screenEnd, -1, `${screen} should end before ${nextScreen}`);
  assert.match(section, /runner-hub-scroll/, `${screen} should keep its Hub scroll body`);
  assert.match(section, /className="hub-screen-heading"/, `${screen} should keep its Hub heading`);
  assert.match(section, new RegExp(`id="${homeButton}"`), `${screen} should keep its Home action`);
}

assert.match(
  css,
  /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*env\(safe-area-inset-top,\s*0px\)/,
  'Hub headings should stick below the safe area',
);
assert.match(
  css,
  /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[\s\S]*?z-index:\s*12[\s\S]*?background:\s*linear-gradient/,
  'Hub headings should stay over scrolling content with an opaque surface',
);
assert.match(
  css,
  /\.hub-home-btn\s*\{[\s\S]*?min-height:\s*44px/,
  'Home needs a 44 px touch target',
);

for (const [id, label] of [
  ['btn-do-ci', 'CLAIM'],
  ['btn-starter-claim', 'CLAIM FREE'],
  ['btn-spin-nft', 'CLAIM ONCHAIN'],
]) {
  const button = new RegExp(`<button(?=[^>]*id="${id}")(?=[^>]*className="[^"]*claim-action[^"]*")[^>]*>[\\s\\S]*?${label}`);
  assert.match(shell, button, `${id} should use the shared claim action`);
}

assert.match(
  css,
  /\.claim-action\s*\{[\s\S]*?background:\s*var\(--button-blue\)[\s\S]*?color:\s*#fff/,
  'Claim actions should use the Base-blue primary treatment',
);

console.log('navigation and claim UI checks passed');
