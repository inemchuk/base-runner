# Daily Spin UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Daily Spin read as a compact premium Base Runner reward ritual while preserving the existing server-selected prize and all reward economics.

**Architecture:** The server API and `useDailySpin` remain unchanged. `Game.tsx` supplies a structured, localizable screen; `game.js` maps the same prizes to a calm wheel presentation and rarity-scaled feedback; `globals.css` owns the focused-flow layout and motion. New PNGs live under `public/game/ui-icons/spin/` and are used only by spin UI.

**Tech Stack:** Next.js client markup, vanilla canvas/CSS animation, `public/game/i18n.js`, Node assertion regression scripts, generated PNG assets.

## Global Constraints

- Do not change `/api/spin`, reward weights, prices, coins, fragment pool behavior, NFT mint semantics, or paymaster paths.
- Preserve the responsive canvas cap and pre-rendered wheel-cache performance strategy.
- Keep the coin logo unchanged; only add spin-specific artwork.
- Do not start a local server as part of this work.
- Every new visible string must have English and Russian `i18n.js` entries.
- Respect `prefers-reduced-motion` for spin rays, result motion, and CTA pulse.

---

### Task 1: Lock the Visual Contract

**Files:**
- Create: `scripts/verify-daily-spin-ui.mjs`
- Modify: `src/components/Game.tsx`, `public/game/i18n.js`

**Interfaces:**
- Consumes: spin nodes with IDs `spin-wheel-canvas`, `spin-prize-card`, `spin-nft-section`, and `btn-do-spin`.
- Produces: a static regression command proving structure, localization, and asset references.

- [ ] **Step 1: Write a failing UI assertion**

```js
assert.match(markup, /className="spin-header"/, 'Spin needs the focused header');
assert.match(markup, /data-i18n="spin\.title"/, 'Spin title must be localizable');
assert.match(game, /\/game\/ui-icons\/spin\/spin-fragments\.png/, 'Wheel must use the unified fragment icon');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*spin-rays/, 'Spin motion must respect reduced-motion');
```

- [ ] **Step 2: Run the assertion and confirm it fails**

Run: `node scripts/verify-daily-spin-ui.mjs`

Expected: assertion failure because the old spin screen has inline header styling and mixed icon paths.

- [ ] **Step 3: Add the smallest structural markup and translations**

```tsx
<div className="spin-header">
  <h2 className="spin-title" data-i18n="spin.title">DAILY SPIN</h2>
  <p className="spin-subtitle" data-i18n="spin.subtitle">One free drop every day · UTC reset</p>
</div>
```

- [ ] **Step 4: Re-run the assertion**

Run: `node scripts/verify-daily-spin-ui.mjs`

Expected: remaining assertions fail until assets, canvas mapping, and CSS arrive in the following tasks.

### Task 2: Produce the Unified Spin Art Pack

**Files:**
- Create: `public/game/ui-icons/spin/spin-wheel.png`
- Create: `public/game/ui-icons/spin/spin-fragments.png`
- Create: `public/game/ui-icons/spin/spin-xp.png`
- Create: `public/game/ui-icons/spin/spin-boost.png`
- Create: `public/game/ui-icons/spin/spin-gear.png`
- Create: `public/game/ui-icons/spin/spin-crate.png`
- Create: `public/game/ui-icons/spin/spin-empty.png`

**Interfaces:**
- Consumes: the existing Base-blue/dark-navy UI palette.
- Produces: 256px alpha PNGs used only by Daily Spin.

- [ ] **Step 1: Generate a 2D icon set on chroma-key backgrounds**

Prompt constraints: non-pixel 2D game UI illustration, deep navy outline, Base blue and cyan, restrained gold highlights, no text, no shadows, no photorealism, no gradients outside the icon, uniform flat chroma-key background.

- [ ] **Step 2: Remove chroma-key backgrounds and validate alpha**

Run: `sips -g pixelWidth -g pixelHeight -g hasAlpha public/game/ui-icons/spin/*.png`

Expected: all icons are square PNGs with `hasAlpha: yes`.

### Task 3: Recompose the Screen and Wheel Presentation

**Files:**
- Modify: `src/components/Game.tsx:504-539`
- Modify: `src/app/globals.css:3863-4141`
- Modify: `public/game/game.js:9387-10497`

**Interfaces:**
- Consumes: existing `DailySpin` public API and `spin-prize` event.
- Produces: the same prize application flow with new asset paths, a focused screen, quiet rarity states, and an external NFT action row.

- [ ] **Step 1: Replace mixed wheel artwork and carnival colors**

```js
const DISPLAY_POOL = [
  { coin: true, label: '15', c0: '#17345A', c1: '#081427' },
  { gearImg: true, label: 'GEAR', c0: '#15314F', c1: '#081427' },
  { fragmentImg: true, label: 'FRAG', c0: '#153653', c1: '#081427' },
];
```

- [ ] **Step 2: Keep feedback tiered and brief**

```js
const confettiCount = { common: 0, uncommon: 8, rare: 14, epic: 24, legendary: 32 };
```

Use a one-shot ray pulse for Epic and Legendary rather than a permanent rotating background.

- [ ] **Step 3: Make the result a single framed strip**

Move `#spin-nft-section` after `#spin-prize-card`. Keep the existing IDs and `onNftClaim` / `onNftLater` handlers, so onchain behavior does not change.

- [ ] **Step 4: Add clear waiting, cooldown, and error copy**

Use localized dynamic strings for `PREPARING DROP…`, timer text, insufficient coins, and no-reward result. A delayed server response must have an explicit visible state; do not change the API call timing or retry behavior.

### Task 4: Validate Without Running Localhost

**Files:**
- Test: `scripts/verify-daily-spin-ui.mjs`

- [ ] **Step 1: Run UI contract and syntax checks**

Run:

```bash
node scripts/verify-daily-spin-ui.mjs
node --check public/game/game.js
git diff --check -- src/components/Game.tsx src/app/globals.css public/game/game.js public/game/i18n.js scripts/verify-daily-spin-ui.mjs
```

Expected: all commands exit 0.

- [ ] **Step 2: Run targeted lint**

Run:

```bash
./node_modules/.bin/eslint src/components/Game.tsx public/game/game.js scripts/verify-daily-spin-ui.mjs
```

Expected: zero errors; existing warnings in the large legacy client may remain.

## Self-Review

- Server/API/economy files are absent from the plan and must remain untouched.
- The result and NFT actions are separate surfaces, avoiding a card inside a card.
- Every static and dynamic spin string is localizable.
- The generated assets are scoped to Daily Spin, so existing coin, booster, cosmetic, and gameplay art remains unchanged.
