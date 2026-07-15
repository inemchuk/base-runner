import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const gameComponent = readFileSync(new URL('../src/components/Game.tsx', import.meta.url), 'utf8');
const gameRuntime = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

assert.equal((gameComponent.match(/id="runner-hub-nav"/g) || []).length, 1, 'render one shared hub nav');
assert.match(gameComponent, /id="shop-runner-stage"/);
assert.match(gameComponent, /id="shop-stage-preview"/);
assert.match(gameComponent, /id="profile-next-unlock"/);
assert.match(gameComponent, /id="profile-career"/);
assert.match(gameComponent, /id="quest-daily-list"/);
assert.match(gameComponent, /id="quest-weekly-list"/);
assert.match(gameComponent, /id="quest-career-list"/);
assert.match(gameComponent, /id="hub-center-play-icon"/);
assert.doesNotMatch(gameComponent, /id="hub-center-home-icon"/);
assert.equal((gameComponent.match(/className="hub-home-btn"/g) || []).length, 4, 'render Home in every hub screen header');
assert.match(gameComponent, /id="btn-home-shop"/);
assert.match(gameComponent, /id="btn-home-quests"/);
assert.match(gameComponent, /id="btn-home-lb"/);
assert.match(gameComponent, /id="btn-home-profile"/);
assert.match(gameComponent, /id="screen-lb" className="screen hidden scroll-screen runner-hub-screen"/);
assert.match(gameComponent, /Leaderboards/);
assert.doesNotMatch(gameComponent, /id="btn-(shop|profile|quests|lb)-back"/);

assert.match(gameRuntime, /const HUB_SCREENS = new Set\(\['menu', 'shop', 'quests', 'lb', 'profile'\]\)/);
assert.match(gameRuntime, /function _updateHubNavigation/);
assert.doesNotMatch(gameRuntime, /centerAction\.dataset\.mode/);
assert.match(gameRuntime, /document\.querySelectorAll\('\.hub-home-btn'\)/);
assert.match(gameRuntime, /_bind\('btn-start',\s+'click', \(\) => Loadout\.show\(\)\)/);
assert.doesNotMatch(gameRuntime, /quest-claim-btn[^`]*quest-reward-label/, 'Claim CTA does not repeat the reward bundle');
assert.match(gameRuntime, /isPending \? 'CLAIMING\.\.\.' : 'CLAIM'/, 'Claim CTA uses one compact action label');

const runnerStageRule = globalStyles.match(/\.shop-runner-stage\s*\{([^}]*)\}/)?.[1] || '';
assert.match(runnerStageRule, /height:\s*174px/, 'Runner Stage has one desktop height across tabs');
assert.match(runnerStageRule, /flex:\s*0 0 174px/, 'Runner Stage cannot flex-shrink based on catalog length');

const questClaimRule = globalStyles.match(/\.quest-claim-btn\s*\{([^}]*)\}/)?.[1] || '';
assert.match(questClaimRule, /white-space:\s*nowrap/, 'Claim CTA never wraps');
assert.match(questClaimRule, /min-width:\s*96px/, 'Claim CTA keeps a compact stable footprint');

assert.equal((gameRuntime.match(/shop-btn-claim-equip(?:-trail)?[^`]*>CLAIM<\/button>/g) || []).length, 2, 'Skin and trail claims use the compact CLAIM label');
assert.doesNotMatch(gameRuntime, /shop-btn-claim-equip(?:-trail)?[^`]*>CLAIM ONCHAIN<\/button>/, 'Shop no longer shows the longer claim label');
assert.equal((gameRuntime.match(/class="shop-nft-unlock-hint">Claim NFT to unlock<\/span>/g) || []).length, 2, 'Skin and trail pending claims share the animated hint');

const shopClaimRule = globalStyles.match(/\.shop-btn-claim-equip, \.shop-btn-claim-equip-trail\s*\{([^}]*)\}/)?.[1] || '';
assert.match(shopClaimRule, /font-size:\s*0\.78rem/, 'Shop claims retain their compact type size');
assert.match(shopClaimRule, /padding:\s*6px 10px/, 'Shop claims retain their compact padding');
const shopUnlockHintRule = globalStyles.match(/\.shop-nft-unlock-hint\s*\{([^}]*)\}/)?.[1] || '';
assert.match(shopUnlockHintRule, /animation:\s*shop-nft-unlock-glow/, 'Pending Shop claim hint softly glows');
assert.match(globalStyles, /@keyframes shop-nft-unlock-glow/, 'Shop hint glow keyframes exist');
assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.shop-nft-unlock-hint\s*\{[\s\S]*?animation:\s*none/, 'Reduced motion disables the Shop hint animation');

const collectionItemRule = globalStyles.match(/\.profile-collection-rail > div\s*\{([^}]*)\}/)?.[1] || '';
assert.match(collectionItemRule, /text-align:\s*center/, 'Collection counters should be centered within their cards');

console.log('runner hub shell assertions passed');
