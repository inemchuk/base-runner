import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const gameJs = readFileSync('public/game/game.js', 'utf8');
const gameShell = readFileSync('src/components/Game.tsx', 'utf8');
const globalCss = readFileSync('src/app/globals.css', 'utf8');

assert.match(gameJs, /const ECONOMY_TIERS = Object\.freeze\(/, 'Shop should define economy tier constants');
assert.match(gameJs, /const CRAFT_CONFIG = Object\.freeze\(/, 'Shop should define craft config per cosmetic item');
assert.match(gameJs, /function getCraftMeta\(itemId\)/, 'Shop should expose craft metadata lookup');
assert.match(gameJs, /function getFocusItem\(\)/, 'Shop should read the current focus item');
assert.match(gameJs, /function setFocusItemLocal\(itemId\)/, 'Shop should set focus locally with validation');
assert.match(gameJs, /function addFragmentsLocal\(itemId, amount\)/, 'Shop should add local per-item fragments');
assert.match(gameJs, /function getCraftStatus\(itemId\)/, 'Shop should compute craft status');
assert.match(gameJs, /function craftItemLocal\(itemId\)/, 'Shop should craft a cosmetic locally');
assert.match(gameJs, /function topUpFragmentsLocal\(itemId, amount\)/, 'Shop should support limited local fragment top-up');
assert.match(gameJs, /function renderFocusStrip\(\)/, 'Game should render a menu focus progress strip');
assert.match(gameJs, /function applyLocalEconomyTestFixture\(\)/, 'Local QA should include an economy fixture');
assert.match(gameJs, /location\.hostname === 'localhost'/, 'Economy fixture should be localhost-only');
assert.match(gameJs, /saveShopDataLocal\(d\)/, 'Economy fragment changes should stay local in Phase 1');

assert.match(gameJs, /getCraftStatus,\s*setFocusItemLocal,\s*addFragmentsLocal,\s*craftItemLocal/, 'Shop public API should expose local economy helpers for QA');
assert.doesNotMatch(gameJs, /__BASE_SHOP_SYNC[\s\S]{0,240}fragments/, 'Phase 1 should not sync fragments through the trust-heavy shop sync path');
assert.doesNotMatch(gameJs, /DailySpin[\s\S]*addFragmentsLocal/, 'Phase 1 should not connect daily spin to fragments');
assert.doesNotMatch(gameJs, /CheckIn[\s\S]*addFragmentsLocal/, 'Phase 1 should not connect check-in to fragments');
assert.doesNotMatch(gameJs, /Quests[\s\S]*addFragmentsLocal/, 'Phase 1 should not connect quests to fragments');
assert.doesNotMatch(gameJs, /Xp[\s\S]*addFragmentsLocal/, 'Phase 1 should not connect level rewards to fragments');

assert.match(gameShell, /id="menu-focus-strip"/, 'Menu should include a compact focus progress strip');
assert.match(gameShell, /id="menu-focus-title"/, 'Focus strip should show item name');
assert.match(gameShell, /id="menu-focus-progress"/, 'Focus strip should show numeric progress');
assert.match(gameShell, /id="menu-focus-fill"/, 'Focus strip should include a progress fill');

assert.match(globalCss, /\.menu-focus-strip/, 'Focus strip should be styled');
assert.match(globalCss, /\.shop-focus-row/, 'Shop focus rows should be styled');
assert.match(globalCss, /\.shop-fragment-track/, 'Shop fragment progress track should be styled');
assert.match(globalCss, /\.shop-btn-focus/, 'Set Focus button should be styled');
assert.match(globalCss, /\.shop-btn-craft/, 'Craft button should be styled');
assert.match(globalCss, /\.shop-btn-topup/, 'Top-up button should be styled');

console.log('economy v1 local smoke checks passed');
