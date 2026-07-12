# Skin Tier and Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved skin rarity, direct-price, and fragment-crafting rules consistently in the server economy and canvas shop without changing existing ownership.

**Architecture:** `src/lib/economy/config.ts` remains the server authority for purchases and craft metadata. It gains an item-level craft-fee override so Epic skins cost 300 coins to craft while other Epic cosmetics keep the tier-default 220 coins. `public/game/game.js` retains its static canvas catalog, mirrors the same active-skin values, and is protected from future drift by a source-contract test.

**Tech Stack:** TypeScript economy core, Next.js route handlers, vanilla canvas/DOM shop, Node assertion scripts.

## Global Constraints

- Do not revoke, reset, refund, or retroactively charge existing player ownership, equipped items, fragments, or coins.
- `skin_1` remains retired and outside the active catalog.
- Direct purchases stay enabled only for Common, Rare, and Epic skins.
- Brian Armstrong, Vitalik Buterin, and Base King are Legendary and require 60 fragments plus a 500-coin craft fee; direct purchase is disabled.
- The 300-coin Epic craft fee applies only to Epic skins; Epic trail and death-effect craft fees stay at 220 coins.
- Do not start the local dev server. Verify with the existing Node checks and any already-running local app only.

---

### Task 1: Make server economy rules match the approved skin catalog

**Files:**
- Modify: `src/lib/economy/config.ts:12-141`
- Modify: `src/lib/economy/core.ts:75-100`
- Modify: `scripts/test-economy-core.mjs:1-90`

**Interfaces:**
- Extends `CraftConfig` with optional `craftFee?: number`.
- `getCraftMeta(itemId)` returns the item-specific fee when present, otherwise `ECONOMY_TIERS[tier].craftFee`.
- `buyShopItem(state, itemId, coins)` continues to reject every `SHOP_PURCHASES` entry whose `price` is `null`.

- [ ] **Step 1: Add the failing server-economy assertions**

  In `scripts/test-economy-core.mjs`, import `CRAFT_CONFIG` and `SHOP_PURCHASES` from the config module, and import `buyShopItem` from the core module:

  ```js
  import {
    CHECKIN_REWARDS,
    CRAFT_CONFIG,
    REWARD_CONTAINERS,
    SHOP_PURCHASES,
    SPIN_REWARD_TABLE,
    getSpinFragmentEv,
  } from '../src/lib/economy/config.ts';
  import {
    awardFragments,
    buyShopItem,
    craftItem,
    getCraftMeta,
    normalizeShopData,
    setFocus,
    topUpFragments,
  } from '../src/lib/economy/core.ts';
  ```

  After the existing rare assertions, add this exact catalog table and checks:

  ```js
  const approvedSkinCatalog = [
    ['skin_street_runner', 'common', 150, 40],
    ['skin_default', 'rare', 800, 100],
    ['skin_3', 'rare', 750, 100],
    ['skin_6', 'rare', 800, 100],
    ['skin_9', 'rare', 850, 100],
    ['skin_10', 'rare', 900, 100],
    ['skin_2', 'epic', 1200, 300],
    ['skin_5', 'epic', 1300, 300],
    ['skin_7', 'epic', 1350, 300],
    ['skin_4', 'epic', 1400, 300],
    ['skin_11', 'epic', 1500, 300],
    ['skin_8', 'legendary', null, 500],
    ['skin_founder', 'legendary', null, 500],
    ['skin_base_king', 'legendary', null, 500],
  ];

  for (const [itemId, tier, price, craftFee] of approvedSkinCatalog) {
    const meta = getCraftMeta(itemId);
    assert.equal(CRAFT_CONFIG[itemId].tier, tier, `${itemId} tier`);
    assert.equal(meta?.craftFee, craftFee, `${itemId} craft fee`);
    assert.equal(SHOP_PURCHASES[itemId].price, price, `${itemId} direct price`);
  }

  assert.equal(getCraftMeta('trail_coins')?.craftFee, 220);
  assert.equal(getCraftMeta('death_dramatic')?.craftFee, 220);
  ```

  After `base` is declared, add purchase behavior checks:

  ```js
  const firefighterPurchase = buyShopItem(base, 'skin_9', 850);
  assert.equal(firefighterPurchase.ok, true);
  assert.equal(firefighterPurchase.coinsDelta, -850);
  assert.equal(firefighterPurchase.state.owned.includes('skin_9'), true);

  const vitalikPurchase = buyShopItem(base, 'skin_founder', 9999);
  assert.equal(vitalikPurchase.ok, false);
  assert.equal(vitalikPurchase.error, 'direct_buy_disabled');
  ```

- [ ] **Step 2: Run the new assertions and confirm the expected failure**

  Run:

  ```bash
  node scripts/test-economy-core.mjs
  ```

  Expected: failure on `skin_2 tier`, because Justin Sun is currently Rare rather than Epic.

- [ ] **Step 3: Add item-level craft-fee overrides and update the server catalog**

  In `src/lib/economy/config.ts`, change the config type and `getCraftMeta` support:

  ```ts
  export interface CraftConfig {
    type: CraftableType;
    tier: EconomyTier;
    name: string;
    sprite?: string;
    craftFee?: number;
  }
  ```

  Replace the active skin entries inside `CRAFT_CONFIG` with these tier and override values (keep `skin_1` unchanged):

  ```ts
  skin_2: { type: 'skin', tier: 'epic', name: 'Justin Sun', sprite: '/game/chars/skin2.png', craftFee: 300 },
  skin_4: { type: 'skin', tier: 'epic', name: 'Satoshi Nakamoto', sprite: '/game/chars/skin4.png', craftFee: 300 },
  skin_5: { type: 'skin', tier: 'epic', name: 'Anatoly Yakovenko', sprite: '/game/chars/skin5.png', craftFee: 300 },
  skin_6: { type: 'skin', tier: 'rare', name: 'Doctor', sprite: '/game/chars/skin6.png' },
  skin_7: { type: 'skin', tier: 'epic', name: 'Bitcoin Maxi', sprite: '/game/chars/skin7.png', craftFee: 300 },
  skin_founder: { type: 'skin', tier: 'legendary', name: 'Vitalik Buterin', sprite: '/game/chars/founder.png' },
  skin_8: { type: 'skin', tier: 'legendary', name: 'Brian Armstrong', sprite: '/game/chars/skin8.png' },
  skin_9: { type: 'skin', tier: 'rare', name: 'Firefighter', sprite: '/game/chars/skin9.png' },
  skin_10: { type: 'skin', tier: 'rare', name: 'Police Officer', sprite: '/game/chars/skin10.png' },
  skin_11: { type: 'skin', tier: 'epic', name: 'Ape Holder', sprite: '/game/chars/skin11.png', craftFee: 300 },
  skin_base_king: { type: 'skin', tier: 'legendary', name: 'Base King', sprite: '/game/chars/base_king.png' },
  ```

  Preserve `skin_street_runner`, `skin_default`, and `skin_3` as Common/Rare. Update only these `SHOP_PURCHASES` values:

  ```ts
  skin_2: { type: 'skin', price: 1200 },
  skin_3: { type: 'skin', price: 750 },
  skin_4: { type: 'skin', price: 1400 },
  skin_5: { type: 'skin', price: 1300 },
  skin_6: { type: 'skin', price: 800 },
  skin_7: { type: 'skin', price: 1350 },
  skin_founder: { type: 'skin', price: null },
  skin_8: { type: 'skin', price: null },
  skin_9: { type: 'skin', price: 850 },
  skin_10: { type: 'skin', price: 900 },
  skin_11: { type: 'skin', price: 1500 },
  skin_base_king: { type: 'skin', price: null },
  ```

  In `src/lib/economy/core.ts`, retain the tier settings but let a catalog item override only the craft fee:

  ```ts
  return {
    itemId,
    type: config.type,
    tier: config.tier,
    name: config.name,
    sprite: config.sprite,
    fragments: tier.fragments,
    craftFee: config.craftFee ?? tier.craftFee,
    topUpCost: tier.topUpCost,
    topUpCapPct: tier.topUpCapPct,
    poolCapPct: tier.poolCapPct,
    directPriceRange: tier.directPriceRange,
  };
  ```

- [ ] **Step 4: Run server and economy regression checks**

  Run:

  ```bash
  node scripts/test-economy-core.mjs
  node scripts/verify-economy-server-authority.mjs
  npx tsc --noEmit
  ```

  Expected: every command exits zero. The client shop-sink check is deliberately deferred to Task 2 because it asserts the canvas catalog that has not changed yet.

- [ ] **Step 5: Commit the server authority change**

  ```bash
  git add src/lib/economy/config.ts src/lib/economy/core.ts scripts/test-economy-core.mjs
  git diff --cached --check
  git commit -m "feat(economy): rebalance skin tiers"
  ```

### Task 2: Mirror the approved catalog in the canvas shop

**Files:**
- Create: `scripts/test-skin-tier-pricing.mjs`
- Modify: `public/game/game.js:6517-6600`
- Modify: `scripts/verify-economy-shop-sinks.mjs:1-50`

**Interfaces:**
- The canvas `ITEMS` catalog uses the same `price` values as `SHOP_PURCHASES` for every active skin.
- Canvas `CRAFT_CONFIG` exposes `craftFee: 300` only on the five approved Epic skins.
- Canvas `getCraftMeta(itemId)` resolves `cfg.craftFee` before the tier default.
- `_directBuyAvailable(itemId)` continues to disable all Legendary direct-buy buttons.

- [ ] **Step 1: Add a failing client-mirror regression test**

  Create `scripts/test-skin-tier-pricing.mjs`:

  ```js
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { CRAFT_CONFIG, SHOP_PURCHASES } from '../src/lib/economy/config.ts';

  const game = readFileSync('public/game/game.js', 'utf8');
  const shopStart = game.indexOf('const Shop = (() => {');
  const shopEnd = game.indexOf('/* ===== quests.js ===== */', shopStart);
  const shop = game.slice(shopStart, shopEnd);

  assert.ok(shopStart >= 0 && shopEnd > shopStart, 'Shop module should be extractable');

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

  console.log('skin tier pricing assertions passed');
  ```

  Update the final client-price assertion in `scripts/verify-economy-shop-sinks.mjs` to check active values instead of retired `skin_1`:

  ```js
  assert.match(game, /skin_2',\s+name:\s+'Justin Sun',\s+price:\s+1200/, 'client shop UI should mirror Justin Sun epic pricing');
  assert.match(game, /skin_founder',\s+name:\s+'Vitalik Buterin',\s+price:\s+null/, 'client shop UI should disable Vitalik direct purchase');
  ```

- [ ] **Step 2: Run the client-mirror test and confirm the expected failure**

  Run:

  ```bash
  node scripts/test-skin-tier-pricing.mjs
  ```

  Expected: failure on Justin Sun’s client price or tier, because the canvas shop still lists him as a Rare 750-coin skin.

- [ ] **Step 3: Update canvas prices, tiers, and item-level craft fees**

  In `public/game/game.js`, replace the active `ITEMS` skin rows with this rarity-ordered catalog. Leave the free Genesis Runner first and do not re-add retired `skin_1`:

  ```js
  { id: 'skin_cryptokid',     name: 'Genesis Runner',    price: 0,    desc: 'Born on-chain',            sprite: '/game/chars/cryptokid.png' },
  { id: 'skin_street_runner', name: 'City Runner',        price: 150,  desc: 'Fast on the streets',      sprite: '/game/chars/street_runner.png' },
  { id: 'skin_default',       name: 'Base Builder',       price: 800,  desc: 'Builds on Base',           sprite: '/game/player.png' },
  { id: 'skin_3',             name: 'Night Operator',     price: 750,  desc: 'Moves after dark',         sprite: '/game/chars/skin3.png' },
  { id: 'skin_6',             name: 'Doctor',             price: 800,  desc: 'Keeps the run alive',      sprite: '/game/chars/skin6.png' },
  { id: 'skin_9',             name: 'Firefighter',        price: 850,  desc: 'Runs toward the heat',      sprite: '/game/chars/skin9.png' },
  { id: 'skin_10',            name: 'Police Officer',     price: 900,  desc: 'Patrols the streets',       sprite: '/game/chars/skin10.png' },
  { id: 'skin_2',             name: 'Justin Sun',         price: 1200, desc: 'TRON founder',              sprite: '/game/chars/skin2.png' },
  { id: 'skin_5',             name: 'Anatoly Yakovenko',  price: 1300, desc: 'Solana co-founder',          sprite: '/game/chars/skin5.png' },
  { id: 'skin_7',             name: 'Bitcoin Maxi',       price: 1350, desc: 'Never sells',                sprite: '/game/chars/skin7.png' },
  { id: 'skin_4',             name: 'Satoshi Nakamoto',   price: 1400, desc: 'The anonymous genesis',       sprite: '/game/chars/skin4.png' },
  { id: 'skin_11',            name: 'Ape Holder',         price: 1500, desc: 'Diamond hands',              sprite: '/game/chars/skin11.png' },
  { id: 'skin_8',             name: 'Brian Armstrong',    price: null, desc: 'Coinbase co-founder',        sprite: '/game/chars/skin8.png' },
  { id: 'skin_founder',       name: 'Vitalik Buterin',    price: null, desc: 'Ethereum co-founder',        sprite: '/game/chars/founder.png' },
  { id: 'skin_base_king',     name: 'Base King',          price: null, desc: 'Jesse Pollak inspired',       sprite: '/game/chars/base_king.png' },
  ```

  Update the matching local `CRAFT_CONFIG` rows:

  ```js
  skin_2:             { type: 'skin', tier: 'epic', craftFee: 300 },
  skin_4:             { type: 'skin', tier: 'epic', craftFee: 300 },
  skin_5:             { type: 'skin', tier: 'epic', craftFee: 300 },
  skin_6:             { type: 'skin', tier: 'rare' },
  skin_7:             { type: 'skin', tier: 'epic', craftFee: 300 },
  skin_founder:       { type: 'skin', tier: 'legendary' },
  skin_8:             { type: 'skin', tier: 'legendary' },
  skin_9:             { type: 'skin', tier: 'rare' },
  skin_10:            { type: 'skin', tier: 'rare' },
  skin_11:            { type: 'skin', tier: 'epic', craftFee: 300 },
  skin_base_king:     { type: 'skin', tier: 'legendary' },
  ```

  Preserve the current tier defaults and override only the local item’s craft fee in `getCraftMeta`:

  ```js
  return {
    ...cfg,
    ...tier,
    craftFee: Number.isFinite(cfg.craftFee) ? cfg.craftFee : tier.craftFee,
    itemId,
    name: item.name,
    sprite: item.sprite || item.iconSrc || '',
    price: item.price || 0,
  };
  ```

- [ ] **Step 4: Verify client rendering contracts and full regression set**

  Run:

  ```bash
  node scripts/test-skin-tier-pricing.mjs
  node scripts/test-economy-core.mjs
  node scripts/verify-economy-shop-sinks.mjs
  node scripts/test-runner-hub.mjs
  node scripts/test-reward-labels.mjs
  node scripts/test-quest-icons.mjs
  node --check public/game/game.js
  npm run lint
  git diff --check
  ```

  Expected: all assertion and syntax commands pass; lint exits zero with only pre-existing warnings.

- [ ] **Step 5: Commit the canvas mirror and regression test**

  ```bash
  git add public/game/game.js scripts/test-skin-tier-pricing.mjs scripts/verify-economy-shop-sinks.mjs
  git diff --cached --check
  git commit -m "feat(shop): align skin catalog pricing"
  ```

## Completion Checklist

- [ ] Firefighter and Police Officer are Rare, directly purchasable skins.
- [ ] Justin Sun and Ape Holder are Epic and cost 35 fragments plus 300 coins to craft.
- [ ] Brian Armstrong, Vitalik Buterin, and Base King are Legendary and cannot be bought directly.
- [ ] Epic non-skin cosmetics still use the 220-coin craft fee.
- [ ] Local and server catalogs have matching active-skin tiers and direct prices.
- [ ] Existing ownership data remains untouched.
