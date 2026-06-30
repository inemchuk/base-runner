# Economy V1 Phase 1 Local Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first safe local slice of Economy V1: Focus Item selection, per-item fragments, craft/top-up status, and shop/menu UI progress without changing reward sources yet.

**Architecture:** Keep the first implementation local-only inside the existing `Shop` module in `public/game/game.js`, because the current game is a single-script canvas app and the user wants no deployment yet. Add small, testable helper functions around the existing shop catalog and render focus/craft controls into the current shop item cards. Do not route fragments through `/api/shop` in this phase; server-authoritative fragment/craft work is a separate phase before any deployment.

**Tech Stack:** Next.js 16 App Router shell, React 19 client component, vanilla browser JavaScript game runtime in `public/game/game.js`, localStorage save state, Node smoke scripts, CSS in `src/app/globals.css`.

## Global Constraints

- No deployment in this phase.
- Do not make client-authored fragments deployable.
- Preserve existing shop fields: `owned`, `equipped`, `boosterCharges`, `trailPacks`, `equippedTrail`, `deathPacks`, `equippedDeath`.
- Keep pre-run loadout behavior intact: selected boosters are consumed only when `START RUN` is pressed.
- Do not connect daily spin, check-in, quests, or XP rewards to fragments in this phase.
- Do not add universal fragments. Store progress per item ID.
- Do not grant full legendary cosmetics from level/reward logic in this phase.
- Follow AGENTS.md: read relevant Next docs before editing `src/components/Game.tsx` or `src/app/globals.css`.

---

## File Structure

- Modify `public/game/game.js`
  - Add Economy V1 constants inside `Shop`.
  - Add local focus/fragments/craft helpers.
  - Render focus/craft/top-up UI in skins, trails, and death effects shop lists.
  - Add localhost-only economy test fixture.
  - Refresh menu focus strip and shop after local economy changes.

- Modify `src/components/Game.tsx`
  - Add compact Focus progress strip to the main menu shell.

- Modify `src/app/globals.css`
  - Style focus strip and shop progress rows with the existing premium arcade surface system.

- Create `scripts/verify-economy-v1-local.mjs`
  - Static smoke checks for helper functions, UI hooks, local-only fixture, and no reward-source integration.

- Modify `scripts/verify-loadout.mjs`
  - Add regression assertions that loadout still consumes boosters only on run start and profile/loadout gear sync hooks remain present.

---

### Task 1: Add Static Economy Smoke Test

**Files:**
- Create: `scripts/verify-economy-v1-local.mjs`
- Modify: none
- Test: `scripts/verify-economy-v1-local.mjs`

**Interfaces:**
- Consumes: current `public/game/game.js`, `src/components/Game.tsx`, `src/app/globals.css`.
- Produces: a smoke script that later tasks must satisfy.

- [ ] **Step 1: Write the failing smoke test**

Create `scripts/verify-economy-v1-local.mjs` with:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
```

Expected: FAIL with a message like `Shop should define economy tier constants`.

- [ ] **Step 3: Commit failing test**

```bash
git add scripts/verify-economy-v1-local.mjs
git commit -m "test: add local economy smoke checks"
```

---

### Task 2: Add Local Economy Catalog And Helpers

**Files:**
- Modify: `public/game/game.js`
- Test: `scripts/verify-economy-v1-local.mjs`

**Interfaces:**
- Consumes: existing `Shop` item arrays: `ITEMS`, `TRAIL_PACKS`, `DEATH_PACKS`, `Save`.
- Produces:
  - `Shop.getCraftMeta(itemId): CraftMeta | null`
  - `Shop.getFocusItem(): string | null`
  - `Shop.setFocusItemLocal(itemId): boolean`
  - `Shop.addFragmentsLocal(itemId, amount): number`
  - `Shop.getCraftStatus(itemId): CraftStatus`
  - `Shop.craftItemLocal(itemId): { ok: boolean; reason?: string }`
  - `Shop.topUpFragmentsLocal(itemId, amount): { ok: boolean; reason?: string; cost?: number }`

- [ ] **Step 1: Insert economy constants after `DEFAULT_TRAIL`**

Add this inside `const Shop = (() => { ... })`, immediately after `const DEFAULT_TRAIL = ...`:

```js
  const ECONOMY_TIERS = Object.freeze({
    common:    { fragments: 10, craftFee: 40,  topUpCost: 20, topUpCapPct: 0.2 },
    rare:      { fragments: 20, craftFee: 100, topUpCost: 35, topUpCapPct: 0.2 },
    epic:      { fragments: 35, craftFee: 220, topUpCost: 60, topUpCapPct: 0.2 },
    legendary: { fragments: 60, craftFee: 500, topUpCost: 160, topUpCapPct: 0 },
  });

  const CRAFT_CONFIG = Object.freeze({
    trail_sparkle: { type: 'trail', tier: 'common' },
    trail_hearts:  { type: 'trail', tier: 'rare' },
    trail_fire:    { type: 'trail', tier: 'rare' },
    trail_coins:   { type: 'trail', tier: 'epic' },
    trail_rainbow: { type: 'trail', tier: 'legendary' },

    death_comic:    { type: 'death', tier: 'common' },
    death_pixel:    { type: 'death', tier: 'rare' },
    death_dramatic: { type: 'death', tier: 'epic' },

    skin_street_runner: { type: 'skin', tier: 'common' },
    skin_1:             { type: 'skin', tier: 'rare' },
    skin_2:             { type: 'skin', tier: 'rare' },
    skin_default:       { type: 'skin', tier: 'rare' },
    skin_3:             { type: 'skin', tier: 'rare' },
    skin_4:             { type: 'skin', tier: 'rare' },
    skin_5:             { type: 'skin', tier: 'epic' },
    skin_6:             { type: 'skin', tier: 'epic' },
    skin_7:             { type: 'skin', tier: 'epic' },
    skin_founder:       { type: 'skin', tier: 'epic' },
    skin_8:             { type: 'skin', tier: 'legendary' },
    skin_9:             { type: 'skin', tier: 'legendary' },
    skin_10:            { type: 'skin', tier: 'legendary' },
    skin_11:            { type: 'skin', tier: 'legendary' },
    skin_base_king:     { type: 'skin', tier: 'legendary' },
  });
```

- [ ] **Step 2: Add local economy data migration helpers after `_migrateCharges`**

Add:

```js
  function _migrateEconomy(d) {
    _migrateCharges(d);
    if (!d.fragments || typeof d.fragments !== 'object' || Array.isArray(d.fragments)) d.fragments = {};
    if (typeof d.focusItemId !== 'string') d.focusItemId = null;
    return d;
  }

  function _catalogItem(itemId) {
    const skin = ITEMS.find(item => item.id === itemId);
    if (skin) return { ...skin, type: 'skin' };
    const trail = TRAIL_PACKS.find(item => item.id === itemId);
    if (trail) return { ...trail, type: 'trail' };
    const death = DEATH_PACKS.find(item => item.id === itemId);
    if (death) return { ...death, type: 'death' };
    return null;
  }

  function getCraftMeta(itemId) {
    const cfg = CRAFT_CONFIG[itemId];
    const item = _catalogItem(itemId);
    if (!cfg || !item) return null;
    const tier = ECONOMY_TIERS[cfg.tier];
    if (!tier) return null;
    return { ...cfg, ...tier, itemId, name: item.name, sprite: item.sprite || item.iconSrc || '', price: item.price || 0 };
  }

  function _ownsItemOfType(itemId, type) {
    if (type === 'skin') return getOwned().includes(itemId);
    if (type === 'trail') return getTrailPacks().includes(itemId);
    if (type === 'death') return getDeathPacks().includes(itemId);
    return false;
  }

  function _grantItemLocal(itemId, type) {
    const d = _migrateEconomy(loadShopData());
    if (type === 'skin') {
      const owned = d.owned || ['skin_cryptokid'];
      if (!owned.includes(itemId)) owned.push(itemId);
      d.owned = owned;
    } else if (type === 'trail') {
      const packs = d.trailPacks || [];
      if (!packs.includes(itemId)) packs.push(itemId);
      d.trailPacks = packs;
    } else if (type === 'death') {
      const packs = d.deathPacks || [];
      if (!packs.includes(itemId)) packs.push(itemId);
      d.deathPacks = packs;
    }
    saveShopDataLocal(d);
  }
```

- [ ] **Step 3: Add focus and fragment helpers after `_grantItemLocal`**

Add:

```js
  function getFocusItem() {
    const d = _migrateEconomy(loadShopData());
    const meta = d.focusItemId ? getCraftMeta(d.focusItemId) : null;
    if (!meta || _ownsItemOfType(d.focusItemId, meta.type)) return null;
    return d.focusItemId;
  }

  function setFocusItemLocal(itemId) {
    const meta = getCraftMeta(itemId);
    if (!meta) return false;
    if (_ownsItemOfType(itemId, meta.type)) return false;
    const d = _migrateEconomy(loadShopData());
    d.focusItemId = itemId;
    saveShopDataLocal(d);
    renderFocusStrip();
    if (typeof Shop !== 'undefined') Shop.refreshVisible();
    return true;
  }

  function getFragmentCount(itemId) {
    const d = _migrateEconomy(loadShopData());
    return Math.max(0, Number(d.fragments[itemId] || 0));
  }

  function addFragmentsLocal(itemId, amount) {
    const meta = getCraftMeta(itemId);
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!meta || value <= 0) return getFragmentCount(itemId);
    const d = _migrateEconomy(loadShopData());
    d.fragments[itemId] = Math.min(meta.fragments, Math.max(0, Number(d.fragments[itemId] || 0)) + value);
    saveShopDataLocal(d);
    renderFocusStrip();
    if (typeof Shop !== 'undefined') Shop.refreshVisible();
    return d.fragments[itemId];
  }

  function getCraftStatus(itemId) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { valid: false, reason: 'invalid_item' };
    const owned = _ownsItemOfType(itemId, meta.type);
    const fragments = getFragmentCount(itemId);
    const balance = typeof Save !== 'undefined' ? Save.getCoins() : 0;
    const readyFragments = fragments >= meta.fragments;
    const readyCoins = balance >= meta.craftFee;
    return {
      valid: true,
      itemId,
      type: meta.type,
      tier: meta.tier,
      name: meta.name,
      fragments,
      target: meta.fragments,
      craftFee: meta.craftFee,
      owned,
      readyFragments,
      readyCoins,
      craftable: !owned && readyFragments && readyCoins,
      pct: Math.min(100, Math.floor((fragments / meta.fragments) * 100)),
    };
  }
```

- [ ] **Step 4: Add craft and top-up helpers after `getCraftStatus`**

Add:

```js
  function craftItemLocal(itemId) {
    const status = getCraftStatus(itemId);
    if (!status.valid) return { ok: false, reason: status.reason };
    if (status.owned) return { ok: false, reason: 'owned' };
    if (!status.readyFragments) return { ok: false, reason: 'fragments' };
    if (!status.readyCoins) return { ok: false, reason: 'coins' };

    const save = Save.load();
    save.coins = Math.max(0, (save.coins || 0) - status.craftFee);
    Save.save(save);

    const d = _migrateEconomy(loadShopData());
    d.fragments[itemId] = status.target;
    if (d.focusItemId === itemId) d.focusItemId = null;
    saveShopDataLocal(d);
    _grantItemLocal(itemId, status.type);

    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    if (typeof refreshGearViews === 'function') refreshGearViews();
    renderFocusStrip();
    return { ok: true };
  }

  function topUpFragmentsLocal(itemId, amount) {
    const meta = getCraftMeta(itemId);
    if (!meta) return { ok: false, reason: 'invalid_item' };
    if (meta.tier === 'legendary') return { ok: false, reason: 'legendary_topup_disabled' };
    if (_ownsItemOfType(itemId, meta.type)) return { ok: false, reason: 'owned' };

    const current = getFragmentCount(itemId);
    const requested = Math.max(1, Math.floor(Number(amount) || 1));
    const threshold = Math.ceil(meta.fragments * 0.8);
    const cap = Math.max(1, Math.floor(meta.fragments * meta.topUpCapPct));
    const alreadyTopupped = Math.max(0, current - threshold);
    const available = Math.min(meta.fragments - current, cap - alreadyTopupped);
    const buyAmount = Math.min(requested, available);
    if (current < threshold || buyAmount <= 0) return { ok: false, reason: 'not_available' };

    const cost = buyAmount * meta.topUpCost;
    if (Save.getCoins() < cost) return { ok: false, reason: 'coins', cost };

    const save = Save.load();
    save.coins = Math.max(0, (save.coins || 0) - cost);
    Save.save(save);
    addFragmentsLocal(itemId, buyAmount);
    if (typeof UI !== 'undefined') UI.updateCoins(Save.getCoins());
    return { ok: true, cost };
  }
```

- [ ] **Step 5: Export helper functions from `Shop`**

Replace the `return { ... }` object at the end of `Shop` with the same existing entries plus:

```js
getCraftMeta,
getFocusItem,
setFocusItemLocal,
addFragmentsLocal,
getFragmentCount,
getCraftStatus,
craftItemLocal,
topUpFragmentsLocal,
```

Keep all existing return entries intact.

- [ ] **Step 6: Run smoke test to verify helper API now passes relevant checks**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
```

Expected: still FAIL, but later than before, because UI markup/styles are not added yet.

- [ ] **Step 7: Commit helper implementation**

```bash
git add public/game/game.js
git commit -m "feat: add local focus economy helpers"
```

---

### Task 3: Render Focus And Craft Controls In Shop

**Files:**
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`
- Test: `scripts/verify-economy-v1-local.mjs`

**Interfaces:**
- Consumes: `getCraftMeta`, `getCraftStatus`, `setFocusItemLocal`, `craftItemLocal`, `topUpFragmentsLocal`.
- Produces: shop card UI for `Set Focus`, progress, `Craft`, and `Top up`.

- [ ] **Step 1: Add shop economy HTML helpers inside `Shop` before `renderSkins`**

Add:

```js
  function _shopEconomyHtml(itemId, isOwned) {
    const status = getCraftStatus(itemId);
    if (!status.valid || isOwned) return '';
    const focused = getFocusItem() === itemId;
    const missing = Math.max(0, status.target - status.fragments);
    const topupAllowed = status.fragments >= Math.ceil(status.target * 0.8)
      && status.tier !== 'legendary'
      && missing > 0;

    return `
      <div class="shop-focus-row${focused ? ' shop-focus-active' : ''}">
        <div class="shop-focus-head">
          <span class="shop-focus-label">${focused ? 'FOCUS' : status.tier.toUpperCase()}</span>
          <span class="shop-focus-count">${status.fragments}/${status.target}</span>
        </div>
        <div class="shop-fragment-track"><div class="shop-fragment-fill" style="width:${status.pct}%"></div></div>
        <div class="shop-focus-actions">
          ${focused ? '<span class="shop-focus-pill">Selected</span>' : `<button class="shop-btn shop-btn-focus" data-id="${itemId}">Set Focus</button>`}
          ${status.readyFragments
            ? `<button class="shop-btn shop-btn-craft${status.readyCoins ? '' : ' disabled'}" data-id="${itemId}">${status.readyCoins ? 'Craft' : 'Need coins'}</button>`
            : topupAllowed
              ? `<button class="shop-btn shop-btn-topup" data-id="${itemId}">+1 · ${status.tier === 'epic' ? 60 : status.tier === 'rare' ? 35 : 20}</button>`
              : ''}
        </div>
      </div>`;
  }

  function _bindEconomyBtns(container) {
    container.querySelectorAll('.shop-btn-focus').forEach(btn => {
      btn.addEventListener('click', () => {
        setFocusItemLocal(btn.dataset.id);
        render();
      });
    });
    container.querySelectorAll('.shop-btn-craft').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', () => {
        craftItemLocal(btn.dataset.id);
        render();
      });
    });
    container.querySelectorAll('.shop-btn-topup').forEach(btn => {
      btn.addEventListener('click', () => {
        topUpFragmentsLocal(btn.dataset.id, 1);
        render();
      });
    });
  }
```

- [ ] **Step 2: Insert economy HTML into skin cards**

In `renderSkins`, inside `.shop-info`, after `${nftInfoHtml}`, insert:

```js
          ${_shopEconomyHtml(item.id, isOwned)}
```

At the end of `renderSkins`, after binding buy/claim/equip handlers, call:

```js
    _bindEconomyBtns(container);
```

- [ ] **Step 3: Insert economy HTML into death effect cards**

In `renderEffects`, for each paid `DEATH_PACKS` card, inside `.shop-info` after `<span class="shop-desc">${item.desc}</span>`, insert:

```js
          ${_shopEconomyHtml(item.id, isOwned)}
```

At the end of `renderEffects`, after existing button bindings, call:

```js
    _bindEconomyBtns(container);
```

- [ ] **Step 4: Insert economy HTML into trail cards**

In `renderTrails`, for each paid `TRAIL_PACKS` card, inside `.shop-info` after the NFT row, insert:

```js
          ${_shopEconomyHtml(item.id, isOwned)}
```

At the end of `renderTrails`, after existing button bindings, call:

```js
    _bindEconomyBtns(container);
```

- [ ] **Step 5: Add CSS for shop focus rows**

In `src/app/globals.css`, add this block after the existing `.shop-nft-claimed` rule and before `.coin-icon`:

```css
    .shop-focus-row {
      margin-top: 7px;
      padding: 7px;
      border-radius: 9px;
      border: 1px solid var(--surface-line);
      background: rgba(255,255,255,0.035);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .shop-focus-active {
      border-color: var(--surface-gold-line);
      background: rgba(255,215,0,0.065);
    }
    .shop-focus-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: rgba(210,225,255,0.58);
      font-size: 0.58rem;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .shop-focus-count { color: rgba(255,255,255,0.86); }
    .shop-fragment-track {
      height: 5px;
      border-radius: 4px;
      overflow: hidden;
      background: rgba(255,255,255,0.08);
    }
    .shop-fragment-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #4D8FFF, #FFD700);
    }
    .shop-focus-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 5px;
    }
    .shop-focus-pill {
      color: #FFD700;
      font-size: 0.62rem;
      font-weight: 900;
      letter-spacing: 0.7px;
    }
    .shop-btn-focus,
    .shop-btn-craft,
    .shop-btn-topup {
      font-size: 0.66rem;
      padding: 5px 8px;
    }
    .shop-btn-craft {
      background: var(--button-gold);
      color: #1a0a00;
      border-color: rgba(255,230,100,0.42);
    }
    .shop-btn-focus,
    .shop-btn-topup {
      background: rgba(77,143,255,0.12);
      color: rgba(190,212,255,0.9);
      border-color: rgba(77,143,255,0.24);
    }
```

- [ ] **Step 6: Run economy smoke test**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
```

Expected: still FAIL until menu focus strip and fixture are added.

- [ ] **Step 7: Commit shop UI**

```bash
git add public/game/game.js src/app/globals.css
git commit -m "feat: show focus progress in shop"
```

---

### Task 4: Add Main Menu Focus Strip

**Files:**
- Modify: `src/components/Game.tsx`
- Modify: `src/app/globals.css`
- Modify: `public/game/game.js`
- Test: `scripts/verify-economy-v1-local.mjs`

**Interfaces:**
- Consumes: `Shop.getFocusItem()`, `Shop.getCraftStatus(itemId)`.
- Produces: compact menu progress strip with IDs `menu-focus-strip`, `menu-focus-title`, `menu-focus-progress`, `menu-focus-fill`.

- [ ] **Step 1: Add menu focus strip markup**

In `src/components/Game.tsx`, inside `.menu-hero` after `#menu-coin-balance`, add:

```tsx
            <button id="menu-focus-strip" className="menu-focus-strip hidden" type="button">
              <span className="menu-focus-kicker">Focus</span>
              <span className="menu-focus-title" id="menu-focus-title">Choose a focus</span>
              <span className="menu-focus-progress" id="menu-focus-progress">0/0</span>
              <span className="menu-focus-track">
                <span className="menu-focus-fill" id="menu-focus-fill" />
              </span>
            </button>
```

- [ ] **Step 2: Add menu focus CSS**

In `src/app/globals.css`, add this block after `#menu-coin-balance img` and before the `/* ===== КНОПКА МАГАЗИНА ===== */` comment:

```css
    .menu-focus-strip {
      width: min(320px, 88vw);
      min-height: 44px;
      margin-top: 10px;
      padding: 8px 10px;
      border: 1px solid var(--surface-line);
      border-radius: 10px;
      background: linear-gradient(180deg, var(--surface-arcade-strong), var(--surface-arcade));
      color: #fff;
      font-family: inherit;
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-rows: auto 5px;
      gap: 5px 8px;
      align-items: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.055);
    }
    .menu-focus-strip.hidden { display: none; }
    .menu-focus-kicker {
      color: rgba(136,170,255,0.64);
      font-size: 0.56rem;
      font-weight: 900;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    .menu-focus-title {
      min-width: 0;
      color: rgba(255,255,255,0.94);
      font-size: 0.74rem;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
    }
    .menu-focus-progress {
      color: #FFD700;
      font-size: 0.68rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .menu-focus-track {
      grid-column: 1 / -1;
      height: 5px;
      border-radius: 4px;
      overflow: hidden;
      background: rgba(255,255,255,0.08);
    }
    .menu-focus-fill {
      display: block;
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #4D8FFF, #FFD700);
    }
```

- [ ] **Step 3: Add `renderFocusStrip` function before `const Shop` return**

In `public/game/game.js`, inside `Shop`, add:

```js
  function renderFocusStrip() {
    const strip = document.getElementById('menu-focus-strip');
    const title = document.getElementById('menu-focus-title');
    const progress = document.getElementById('menu-focus-progress');
    const fill = document.getElementById('menu-focus-fill');
    if (!strip || !title || !progress || !fill) return;

    const focusId = getFocusItem();
    if (!focusId) {
      strip.classList.add('hidden');
      return;
    }

    const status = getCraftStatus(focusId);
    if (!status.valid || status.owned) {
      strip.classList.add('hidden');
      return;
    }

    strip.classList.remove('hidden');
    title.textContent = status.name;
    progress.textContent = `${status.fragments}/${status.target}`;
    fill.style.width = `${status.pct}%`;
  }
```

- [ ] **Step 4: Wire focus strip refreshes**

In `UI.show(name)`, in the branch that handles `name === 'menu'`, add:

```js
      if (typeof Shop !== 'undefined' && Shop.renderFocusStrip) Shop.renderFocusStrip();
```

In `_initUI()`, add this binding after the existing `btn-start` binding:

```js
  _bind('menu-focus-strip', 'click', () => { Shop.show(); });
```

Also add `renderFocusStrip` to the `Shop` return object.

- [ ] **Step 5: Run smoke test**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
```

Expected: still FAIL until local fixture assertions are satisfied.

- [ ] **Step 6: Commit menu strip**

```bash
git add src/components/Game.tsx src/app/globals.css public/game/game.js
git commit -m "feat: show focus progress on menu"
```

---

### Task 5: Add Local Economy QA Fixture

**Files:**
- Modify: `public/game/game.js`
- Test: `scripts/verify-economy-v1-local.mjs`

**Interfaces:**
- Consumes: localStorage `shop_v1`, `Shop.addFragmentsLocal`, `Shop.setFocusItemLocal`.
- Produces: localhost-only `?economyTest=1` and `?economyTest=restore` fixture.

- [ ] **Step 1: Add local economy fixture helper near `applyLocalGearTestFixture`**

In `public/game/game.js`, add this after `applyLocalGearTestFixture()`:

```js
  const ECONOMY_TEST_BACKUP_KEY = 'shop_v1_economy_test_backup';

  function applyLocalEconomyTestFixture() {
    const allowed = typeof location !== 'undefined'
      && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '::1');
    if (!allowed) return false;

    const params = new URLSearchParams(location.search);
    const mode = params.get('economyTest');
    if (!mode) return false;

    const clearParam = () => {
      try {
        const url = new URL(location.href);
        url.searchParams.delete('economyTest');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch {}
    };

    if (mode === 'restore') {
      try {
        const rawBackup = localStorage.getItem(ECONOMY_TEST_BACKUP_KEY);
        if (rawBackup) {
          const backup = JSON.parse(rawBackup);
          if (backup.existed) localStorage.setItem(SAVE_KEY, backup.value);
          else localStorage.removeItem(SAVE_KEY);
          localStorage.removeItem(ECONOMY_TEST_BACKUP_KEY);
          _shopCache = null;
        }
      } catch {}
      clearParam();
      if (typeof refreshGearViews === 'function') refreshGearViews();
      renderFocusStrip();
      return true;
    }

    if (mode !== '1') {
      clearParam();
      return false;
    }

    try {
      if (!localStorage.getItem(ECONOMY_TEST_BACKUP_KEY)) {
        const currentRaw = localStorage.getItem(SAVE_KEY);
        localStorage.setItem(ECONOMY_TEST_BACKUP_KEY, JSON.stringify({
          existed: currentRaw !== null,
          value: currentRaw,
        }));
      }
    } catch {}

    const d = _migrateEconomy(loadShopData());
    d.focusItemId = 'trail_fire';
    d.fragments = { ...(d.fragments || {}), trail_fire: 17, skin_8: 12 };
    d.boosterCharges = { ...(d.boosterCharges || {}), boost_magnet: 2, boost_double: 2, boost_shield: 1 };
    saveShopDataLocal(d);
    clearParam();
    if (typeof refreshGearViews === 'function') refreshGearViews();
    renderFocusStrip();
    return true;
  }
```

- [ ] **Step 2: Invoke fixture during startup**

In `_initUI()`, immediately after the existing startup line `if (typeof Shop !== 'undefined' && Shop.applyLocalGearTestFixture) Shop.applyLocalGearTestFixture();`, add:

```js
  if (typeof Shop !== 'undefined' && Shop.applyLocalEconomyTestFixture) Shop.applyLocalEconomyTestFixture();
```

Add `applyLocalEconomyTestFixture` to the `Shop` return object.

- [ ] **Step 3: Run smoke test**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
```

Expected: PASS with `economy v1 local smoke checks passed`.

- [ ] **Step 4: Run loadout regression smoke test**

Run:

```bash
node scripts/verify-loadout.mjs
```

Expected: PASS with `loadout smoke checks passed`.

- [ ] **Step 5: Commit local fixture**

```bash
git add public/game/game.js scripts/verify-economy-v1-local.mjs
git commit -m "test: add local economy fixture"
```

---

### Task 6: Final Verification For Phase 1

**Files:**
- Modify: none unless verification reveals a defect.
- Test: local command suite.

**Interfaces:**
- Consumes: all Phase 1 tasks.
- Produces: verified local-only implementation ready for manual in-app browser review.

- [ ] **Step 1: Run static smoke tests**

Run:

```bash
node scripts/verify-economy-v1-local.mjs
node scripts/verify-loadout.mjs
```

Expected:

```text
economy v1 local smoke checks passed
loadout smoke checks passed
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: compiled successfully. Existing Next warning about multiple lockfiles can remain if unchanged.

- [ ] **Step 4: Verify local server responds**

Run:

```bash
curl -I http://localhost:3000/
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 5: Manual QA in Codex in-app browser**

Open:

```text
http://localhost:3000/?economyTest=1
```

Verify:

- Main menu shows a compact Focus strip for `Fire Trail`.
- Shop trails tab shows `Fire Trail` focus progress.
- `Set Focus` changes the strip.
- `Top up` adds one fragment and deducts coins only when 80% threshold is met.
- `Craft` unlocks the item locally when fragments and coins are sufficient.
- Profile/loadout gear views still sync after crafting/equipping.
- `http://localhost:3000/?economyTest=restore` restores the previous local shop state.

- [ ] **Step 6: Commit final fixes if any**

If verification required edits:

```bash
git add public/game/game.js src/components/Game.tsx src/app/globals.css scripts/verify-economy-v1-local.mjs scripts/verify-loadout.mjs
git commit -m "fix: verify local focus economy"
```

If no edits were required, do not create an empty commit.

---

## Out Of Scope For This Plan

- No reward-source integration for daily spin.
- No reward-source integration for check-in.
- No reward-source integration for quests.
- No reward-source integration for XP/level rewards.
- No server-authoritative fragment/craft API.
- No deployment.
- No run modifiers.

These are separate plans after the local Focus/craft loop is visually and functionally approved.

## Self-Review Notes

- Spec coverage for Phase 1: Focus Item, per-item fragments, craft fees, top-up, validation, local-only gate, menu/shop UI, loadout precondition regression.
- Spec intentionally not covered here: reward source tables, server authority, telemetry, terminal-state tuning, onchain layer.
- Placeholder scan: no `TBD`, no `TODO`, no open-ended implementation steps.
- Type consistency: helper names use `Local` suffix for client-authoritative prototype paths and do not reuse names intended for future server-authoritative APIs.
