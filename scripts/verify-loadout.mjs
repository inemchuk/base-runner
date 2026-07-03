import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const gameShell = readFileSync('src/components/Game.tsx', 'utf8');
const gameJs = readFileSync('public/game/game.js', 'utf8');
const globalCss = readFileSync('src/app/globals.css', 'utf8');

assert.match(gameShell, /id="screen-loadout"/, 'Game shell should include the pre-run loadout screen');
assert.match(gameShell, /id="loadout-gear"/, 'Loadout should show a gear section');
assert.match(gameShell, /id="loadout-skin-name"/, 'Loadout should show the equipped skin name');
assert.match(gameShell, /id="loadout-trail-name"/, 'Loadout should show the equipped trail name');
assert.match(gameShell, /id="btn-loadout-skin-next"/, 'Loadout should let players cycle skins');
assert.match(gameShell, /id="btn-loadout-trail-next"/, 'Loadout should let players cycle trails');
assert.match(gameShell, /id="loadout-build-summary"/, 'Loadout should summarize the selected run build before start');
assert.match(gameShell, /id="loadout-build-title"/, 'Loadout build summary should have an updatable title');
assert.match(gameShell, /id="run-booster-hud"/, 'HUD should show active run boosters during play');
assert.match(gameShell, /id="run-boost-magnet"/, 'HUD should include a magnet booster indicator');
assert.match(gameShell, /id="run-boost-double"/, 'HUD should include a double-coins booster indicator');
assert.match(gameShell, /id="run-boost-shield"/, 'HUD should include a shield booster indicator');
assert.match(gameShell, /id="run-boost-toast"/, 'HUD should include a compact run event toast');
const shellIconNames = ['shop', 'quests', 'leaderboard', 'profile', 'starter-pack', 'daily-checkin', 'daily-spin'];
const utilityIconNames = [
  'settings', 'music', 'sound', 'vibration',
  'medal-gold', 'medal-silver', 'medal-bronze',
  'celebration', 'coin-pouch', 'gem', 'crown', 'fire', 'lock', 'gamepad',
];

for (const iconName of [...shellIconNames, ...utilityIconNames]) {
  assert.ok(existsSync(`public/game/ui-icons/${iconName}.png`), `UI icon asset should exist: ${iconName}.png`);
}
for (const iconName of shellIconNames) {
  assert.match(gameShell, new RegExp(`/game/ui-icons/${iconName}\\.png`), `Game shell should use generated ${iconName} icon`);
}
for (const iconName of ['settings', 'music', 'sound', 'vibration']) {
  assert.match(gameShell, new RegExp(`/game/ui-icons/${iconName}\\.png`), `Game shell should use generated ${iconName} icon`);
}
for (const iconName of ['medal-gold', 'medal-silver', 'medal-bronze', 'coin-pouch', 'gem', 'crown', 'fire', 'lock', 'gamepad', 'celebration']) {
  assert.match(gameJs, new RegExp(`(/game/ui-icons/${iconName}\\.png|['"\`]${iconName}['"\`])`), `Dynamic UI should use generated ${iconName} icon`);
}
assert.doesNotMatch(gameShell, /<span className="spin-banner-icon">[\u{1F3B0}\u{1F4C5}\u{1F381}]/u, 'Daily banners should not use emoji icons');
assert.doesNotMatch(gameShell, /<span className="tab-icon">[\u{1F6D2}\u{1F3AF}\u{1F3C6}]/u, 'Menu tabs should not use emoji icons for shop, quests, or leaderboard');
assert.doesNotMatch(gameShell, /id="menu-profile-icon">\u{1F464}/u, 'Profile tab should not use an emoji icon');
assert.match(gameJs, /\/game\/ui-icons\/daily-spin\.png/, 'Dynamic daily spin button should use the generated spin icon');
assert.doesNotMatch(gameJs, /\u{1F3B0} (FREE SPIN|SPIN)/u, 'Dynamic daily spin button should not use slot-machine emoji');
assert.match(gameShell, /className="hud-rail"/, 'Gameplay HUD should use a single compact top rail');
assert.match(gameShell, /className="hud-economy"/, 'Gameplay HUD should group coins, active boosters, and settings together');
assert.doesNotMatch(gameShell, /className="hud-right-stack"/, 'Run booster indicators should be integrated into the coin HUD, not stacked as a separate floating panel');
assert.match(gameShell, /<div className="hud-economy">[\s\S]*id="coin-hud"[\s\S]*id="run-booster-hud"[\s\S]*id="btn-settings-game"/, 'Active run boosters should live in the compact economy cluster');
assert.match(gameShell, /id="btn-profile-skin-prev"/, 'Profile should let players cycle skins without opening shop');
assert.match(gameShell, /id="btn-profile-skin-next"/, 'Profile should let players cycle skins without opening shop');
assert.match(gameShell, /id="btn-profile-trail-prev"/, 'Profile should let players cycle trails without opening shop');
assert.match(gameShell, /id="btn-profile-trail-next"/, 'Profile should let players cycle trails without opening shop');
assert.match(gameShell, /minHeight:\s*146/, 'Loadout skin/trail cards should be tall enough to feel like gear cards');
assert.match(gameShell, /width:\s*82/, 'Loadout skin/trail previews should be visually prominent');
assert.match(gameShell, /width:\s*28/, 'Loadout skin/trail card arrows should stay visually secondary');
assert.match(globalCss, /grid-template-columns:\s*28px minmax\(0,\s*1fr\) 28px/, 'Loadout gear grid should reserve compact columns for arrows');
assert.match(globalCss, /\.loadout-build-summary/, 'Loadout build summary should be styled');
assert.match(globalCss, /\.hud-rail/, 'Gameplay HUD should style a single premium top rail');
assert.match(globalCss, /\.hud-economy/, 'Gameplay HUD should style a compact economy cluster');
assert.match(globalCss, /\.run-booster-hud/, 'Active run booster HUD should be styled');
assert.match(globalCss, /\.run-booster-hud\s*\{[\s\S]*background:\s*transparent/, 'Active run booster HUD should not render as a second floating capsule');
assert.match(globalCss, /\.run-boost-icon\s*\{[\s\S]*width:\s*18px/, 'Active run booster icons should stay compact inside the top rail');
assert.match(globalCss, /\.run-boost-icon\.pulse/, 'Booster feedback pulse state should be styled');
assert.match(globalCss, /\.run-boost-icon\.used/, 'One-shot used booster state should be styled');
assert.match(globalCss, /\.run-boost-toast/, 'Run event toast should be styled');
assert.match(gameJs, /const Loadout = \(\(\) => \{/, 'game.js should define the local Loadout module');
assert.match(gameJs, /Loadout\.show\(\)/, 'Play should open loadout before starting a run');
assert.match(gameJs, /spendBoosterLocal/, 'Loadout should spend selected boosters locally');
assert.match(gameJs, /getSkinOptions/, 'Shop should expose skin options for loadout');
assert.match(gameJs, /getTrailOptions/, 'Shop should expose trail options for loadout');
assert.match(gameJs, /equipSkinLocal/, 'Loadout should equip skins locally');
assert.match(gameJs, /equipTrailLocal/, 'Loadout should equip trails locally');
assert.match(gameJs, /btn-loadout-skin-next/, 'Loadout should bind skin cycling controls');
assert.match(gameJs, /btn-loadout-trail-next/, 'Loadout should bind trail cycling controls');
assert.match(gameJs, /renderBuildSummary/, 'Loadout should render a session build summary');
assert.match(gameJs, /setRunBoosters/, 'UI should expose active run booster HUD updates');
assert.match(gameJs, /triggerRunBoosterFeedback/, 'UI should expose short booster event feedback');
assert.match(gameJs, /markRunBoosterUsed/, 'UI should mark one-shot boosters as used');
assert.match(gameJs, /addShieldBurst/, 'Renderer should expose a premium shield-save burst');
assert.match(gameJs, /addCoinEffect\(.*coinValue/, 'Coin feedback should show doubled coin value when double coins is active');
assert.match(gameJs, /function refreshGearViews\(\)/, 'Gear changes should refresh loadout, profile, and shop views');
assert.match(gameJs, /function cycleProfileGear\(/, 'Profile should cycle equipped gear directly');
assert.match(gameJs, /btn-profile-skin-next/, 'Profile skin next control should be bound');
assert.match(gameJs, /btn-profile-trail-next/, 'Profile trail next control should be bound');
assert.match(gameJs, /applyLocalGearTestFixture/, 'Local QA should have a localhost-only 2+ gear fixture');
assert.match(gameJs, /location\.hostname === 'localhost'/, 'Gear fixture should only be available on localhost');
assert.match(gameJs, /GEAR_TEST_BACKUP_KEY/, 'Gear fixture should back up and restore the user shop state');
assert.match(gameJs, /NFT_CLAIMED_KEY/, 'Gear fixture should back up NFT claim state for test skins');
assert.match(gameJs, /skin_street_runner', 'skin_1/, 'Gear fixture should unlock multiple skins for QA');
assert.match(gameJs, /boosterCharges = \{ boost_magnet: 3, boost_double: 3, boost_shield: 3 \}/, 'Gear fixture should include booster charges for run-session QA');
assert.match(gameJs, /saveShopDataLocal\(d\)/, 'Gear fixture should remain local and avoid server sync');
assert.match(gameJs, /pendingPlayerImgSrc/, 'Player sprite loading should track the current pending skin sprite');
assert.doesNotMatch(gameJs, /function reloadPlayerSprite\(\) \{\s*playerImg = null;/, 'Reloading a selected skin should keep the last good sprite until the new image is ready');
assert.doesNotMatch(
  gameJs,
  /_bind\('btn-start',\s*'click',\s*\(\) => \{ _requestSessionToken\(\); initGame\(\); \}\);/,
  'Play should not request a session and start the game directly'
);
assert.doesNotMatch(
  gameJs,
  /_bind\('btn-change-skin',\s*'click',\s*\(\) => \{ Shop\.show\(\); Shop\.setTab\('skins'\); \}\);/,
  'Profile skin controls should not only redirect to shop'
);
assert.doesNotMatch(
  gameJs,
  /_bind\('btn-change-trail',\s*'click',\s*\(\) => \{ Shop\.show\(\); Shop\.setTab\('trails'\); \}\);/,
  'Profile trail controls should not only redirect to shop'
);

const playerModule = gameJs.match(/const Player = \(\(\) => \{[\s\S]*?\/\* ===== obstacles\.js ===== \*\//)?.[0] ?? '';
assert.ok(playerModule, 'Should find Player module');
const playerInit = playerModule.match(/function init\(\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
assert.doesNotMatch(playerInit, /Shop\.useBooster\('boost_magnet'\)/, 'Magnet should not be spent automatically in Player.init');
assert.doesNotMatch(playerInit, /Shop\.useBooster\('boost_double'\)/, 'Double coins should not be spent automatically in Player.init');
assert.doesNotMatch(playerModule, /Shop\.useBooster\('boost_shield'\)/, 'Shield should be spent from loadout, not at death time');

console.log('loadout smoke checks passed');
