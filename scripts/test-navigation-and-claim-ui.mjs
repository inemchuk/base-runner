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
  /\.runner-hub-scroll\s*\{[\s\S]*?padding:\s*0 16px max\(126px, calc\(116px \+ env\(safe-area-inset-bottom, 0px\)\)\)/,
  'Hub scroll bodies should let the sticky strip reach the top edge',
);
assert.doesNotMatch(
  css,
  /@media \(max-height: 720px\)\s*\{[\s\S]*?\.runner-hub-scroll\s*\{[^}]*padding-top:/,
  'Compact displays should not reintroduce an empty gap above the sticky strip',
);
assert.match(
  css,
  /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*0[\s\S]*?padding:\s*max\(8px, calc\(env\(safe-area-inset-top, 0px\) \+ 8px\)\) 10px 10px/,
  'Hub headings should occupy the top edge while keeping controls below the safe area',
);
assert.match(
  css,
  /\.runner-hub-scroll\s+\.hub-screen-heading::before\s*\{[\s\S]*?left:\s*50%[\s\S]*?width:\s*100vw[\s\S]*?transform:\s*translateX\(-50%\)[\s\S]*?background:\s*linear-gradient/,
  'Hub headings should use a full-width opaque surface behind the content grid',
);
assert.doesNotMatch(
  css,
  /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[^}]*background:\s*linear-gradient/,
  'The compact heading grid should not render as a cut-out card',
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
assert.match(
  css,
  /\.shop-btn\.claim-action,\s*\.shop-nft-btn\.claim-action,\s*\.quest-claim-btn\.claim-action,\s*\.levelup-nft-btn\.claim-action,\s*#btn-do-ci\.claim-action\s*\{[\s\S]*?background:\s*var\(--button-blue\)[\s\S]*?border:\s*1px solid rgba\(136,170,255,0\.34\)/,
  'Dynamic claim buttons should preserve the shared Base-blue visual after their local layout rules',
);
assert.doesNotMatch(
  css,
  /\.quest-claim-btn\s*\{[^}]*background:\s*var\(--button-gold\)/,
  'Quest claim buttons should not retain a gold-only visual treatment',
);

const runtime = readFileSync('public/game/game.js', 'utf8');

assert.match(runtime, /class="shop-nft-btn claim-action"[^>]*data-id="\$\{itemId\}">CLAIM ONCHAIN/, 'Generic Shop NFT claims should use the shared onchain action');
assert.match(runtime, /class="shop-btn claim-action shop-btn-claim-equip"[^>]*>CLAIM ONCHAIN/, 'Skin NFT claims should use the shared onchain action');
assert.match(runtime, /class="shop-btn claim-action shop-btn-claim-equip-trail"[^>]*>CLAIM ONCHAIN/, 'Trail NFT claims should use the shared onchain action');
assert.match(runtime, /class="quest-claim-btn claim-action"[^>]*>\$\{isPending \? 'CLAIMING\.\.\.' : 'CLAIM'\}/, 'Quest claims should use the shared claim action');
assert.match(runtime, /btn\.className = 'levelup-nft-btn claim-action';[\s\S]*?btn\.textContent = 'CLAIM ONCHAIN';/, 'Level-up NFT claims should use the shared onchain action');
assert.match(runtime, /mintBtn\.textContent = 'CLAIM ONCHAIN';/, 'Daily Spin should restore explicit onchain copy after state changes');
assert.match(runtime, /claimBtn\.textContent = 'CLAIM FREE';/, 'Starter Pack should restore the shared free-claim copy after a failed mint');
assert.match(runtime, /spinMintBtn\.textContent = '✓ CLAIMED';/, 'Daily Spin should use the shared completion label');
assert.match(runtime, /levelupMintBtn\.textContent = '✓ CLAIMED';/, 'Level-up NFT claims should use the shared completion label');
assert.match(runtime, /claimed: '✓ CLAIMED'/, 'Run Complete should use the shared completion label');
assert.match(runtime, /<span class="quest-done">✓ CLAIMED<\/span>/, 'Quest completion should use the shared completion label');

console.log('navigation and claim UI checks passed');
