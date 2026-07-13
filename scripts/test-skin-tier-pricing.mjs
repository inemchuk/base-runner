import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRAFT_CONFIG, SHOP_PURCHASES } from '../src/lib/economy/config.ts';

const game = readFileSync('public/game/game.js', 'utf8');
const shopStart = game.indexOf('const Shop = (() => {');
const shopEnd = game.indexOf('/* ===== quests.js ===== */', shopStart);
const shop = game.slice(shopStart, shopEnd);
const xpStart = game.indexOf('const Xp = (() => {');
const xpEnd = game.indexOf('/* ===== main.js ===== */', xpStart);
const xp = game.slice(xpStart, xpEnd);

assert.ok(shopStart >= 0 && shopEnd > shopStart, 'Shop module should be extractable');
assert.ok(xpStart >= 0 && xpEnd > xpStart, 'XP module should be extractable');

const activeSkinIds = [
  'skin_street_runner', 'skin_default', 'skin_3', 'skin_6', 'skin_9', 'skin_10',
  'skin_2', 'skin_5', 'skin_7', 'skin_4', 'skin_11',
  'skin_8', 'skin_founder', 'skin_base_king',
];

for (const itemId of activeSkinIds) {
  const price = SHOP_PURCHASES[itemId].price;
  const renderedPrice = price === null ? 'null' : String(price);
  assert.match(
    shop,
    new RegExp(`\\{ id: '${itemId}'[^\\n]+price:\\s*${renderedPrice}\\s*,`),
    `${itemId} client price should mirror the server catalog`,
  );
  assert.match(
    shop,
    new RegExp(`${itemId}:\\s*\\{ type: 'skin', tier: '${CRAFT_CONFIG[itemId].tier}'`),
    `${itemId} client tier should mirror the server catalog`,
  );
}

for (const itemId of ['skin_2', 'skin_4', 'skin_5', 'skin_7', 'skin_11']) {
  assert.match(shop, new RegExp(`${itemId}:\\s*\\{[^}]*craftFee: 300`));
}

assert.match(shop, /craftFee: Number\.isFinite\(cfg\.craftFee\) \? cfg\.craftFee : tier\.craftFee/);
assert.match(shop, /function _directBuyAvailable\(itemId\)/);
assert.match(shop, /meta\.tier !== 'legendary'/);
assert.match(shop, /Craft only/);
assert.match(
  xp,
  /20:\s+\{ type: 'bundle', value: \{ coins: 150, fragments: 20 \}, iconSrc: '\/game\/ui-icons\/fragments\.png', label: '\+150 coins \+ 20 fragments' \}/,
  'level 20 should award progress toward Legendary skins instead of Vitalik directly',
);

console.log('skin tier pricing assertions passed');
