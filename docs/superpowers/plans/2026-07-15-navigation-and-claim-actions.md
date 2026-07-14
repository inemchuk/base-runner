# Navigation and Claim Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Runner Hub exit available on long screens and present every reward claim with one Base-blue visual language.

**Architecture:** The existing Runner Hub remains the only persistent navigation shell. CSS turns its current four in-content headings into safe-area-aware sticky headers; no router, screen registry, or economy behavior changes. A reusable `claim-action` CSS class supplies the shared Base-blue claim surface, while static TSX and dynamic `game.js` markup apply it to each claim source without changing claim authority or duplicate-submit guards.

**Tech Stack:** Next.js 16 App Router, React 19 TSX, vanilla browser JavaScript in `public/game/game.js`, global CSS, Node `assert` contract scripts.

## Global Constraints

- Keep the existing five Hub destinations and order: Shop, Quests, Play, Leaders, Profile.
- Apply sticky headers only to Shop, Quests, Leaders, and Profile; do not add Hub navigation to run, reward, or settings flows.
- Preserve the current screen registry, wallet/transaction authority, economy values, and Run Complete idempotency.
- Use Base Blue `#0052FF` for every `CLAIM`, `CLAIM FREE`, and `CLAIM ONCHAIN` button; gold remains value/price decoration, not Claim-button background.
- Keep onchain wording explicit and preserve each existing pending/disabled guard.
- Use `apply_patch` for every workspace edit and leave the user-owned `public/game/chars/backups-before-full-rework/`, `public/game/chars/rework/`, and `tmp/` directories untouched.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/app/globals.css` | Sticky Hub-header geometry, focus/range handling, and the reusable Base-blue `claim-action` visual primitive. |
| `src/components/Game.tsx` | Applies `claim-action` and final copy to static score, Daily Spin, Starter Pack, and Daily Check-in buttons. |
| `public/game/game.js` | Applies shared classes/copy to dynamic Quest, Shop NFT, and Level-up NFT claims while retaining their current handlers and repeat-submit guards. |
| `scripts/test-navigation-and-claim-ui.mjs` | Static UI contract for sticky Hub headings and every Claim entry point. |
| `scripts/test-run-complete-ui.mjs` | Existing Run Complete contract updated from the removed outline style to the unified Claim primitive. |

## Task 1: Sticky headers for the four long Runner Hub screens

**Files:**
- Create: `scripts/test-navigation-and-claim-ui.mjs`
- Modify: `src/app/globals.css:2867-2924`

**Interfaces:**
- Consumes: existing `#screen-profile`, `#screen-shop`, `#screen-quests`, `#screen-lb`, their `.runner-hub-scroll` bodies, and existing `.hub-screen-heading > .hub-home-btn` markup.
- Produces: a CSS-only sticky `hub-screen-heading` contract that later work must not replace with duplicate Back/Home controls.

- [ ] **Step 1: Write the failing sticky-header contract**

Create `scripts/test-navigation-and-claim-ui.mjs` with the following checks. They prove that the existing headings remain inside the scroll body and that the CSS feature is initially absent.

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/components/Game.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

for (const [screen, homeButton] of [
  ['screen-profile', 'btn-home-profile'],
  ['screen-shop', 'btn-home-shop'],
  ['screen-quests', 'btn-home-quests'],
  ['screen-lb', 'btn-home-lb'],
]) {
  const screenStart = shell.indexOf(`id="${screen}"`);
  const screenEnd = shell.indexOf('</div>', screenStart);
  assert.notEqual(screenStart, -1, `${screen} should exist`);
  assert.ok(shell.indexOf('className="hub-screen-heading"', screenStart) > screenStart, `${screen} should keep its Hub heading`);
  assert.ok(shell.indexOf(`id="${homeButton}"`, screenStart) > screenStart, `${screen} should keep its Home action`);
  assert.ok(screenEnd > screenStart, `${screen} should close normally`);
}

assert.match(css, /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[\s\S]*?position:\s*sticky[\s\S]*?top:\s*env\(safe-area-inset-top,\s*0px\)/, 'Hub headings should stick below the safe area');
assert.match(css, /\.runner-hub-scroll\s+\.hub-screen-heading\s*\{[\s\S]*?z-index:\s*12[\s\S]*?background:\s*linear-gradient/, 'Hub headings should stay over scrolling content with an opaque surface');
assert.match(css, /\.hub-home-btn\s*\{[\s\S]*?min-height:\s*44px/, 'Home needs a 44 px touch target');

console.log('navigation and claim UI checks passed');
```

- [ ] **Step 2: Run the contract and verify the expected failure**

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: failure stating `Hub headings should stick below the safe area`, because `.hub-screen-heading` is not sticky yet.

- [ ] **Step 3: Implement the shared sticky header styles**

In `src/app/globals.css`, keep the existing grid markup but replace its Hub-only geometry with this exact declaration block. The heading remains inside each scroll body, so the browser retains each section's scroll position while the header stays visible.

```css
.runner-hub-scroll .hub-screen-heading {
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 12;
  width: min(360px, 92vw);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  min-height: 60px;
  margin: 0 0 16px;
  padding: 8px 0 10px;
  background: linear-gradient(180deg, rgba(5,8,20,0.99), rgba(5,8,20,0.96));
  border-bottom: 1px solid rgba(77,143,255,0.18);
  box-shadow: 0 10px 18px rgba(0,0,0,0.2);
}

.hub-home-btn {
  min-height: 44px;
  align-self: center;
}
```

Keep the existing title, eyebrow, status-chip, and Shop-balance declarations after this block. Do not add a second header, an event listener, or a `scrollTop = 0` assignment.

- [ ] **Step 4: Run the sticky-header contract and CSS syntax check**

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: `navigation and claim UI checks passed`.

Run: `node --check public/game/game.js`

Expected: exit code 0; no JavaScript was modified in this task.

- [ ] **Step 5: Commit the independently tested navigation change**

```bash
git add src/app/globals.css scripts/test-navigation-and-claim-ui.mjs
git commit -m "feat: keep hub navigation available while scrolling"
```

## Task 2: Establish one static Base-blue Claim primitive

**Files:**
- Modify: `scripts/test-run-complete-ui.mjs:80-113`
- Modify: `scripts/test-navigation-and-claim-ui.mjs`
- Modify: `src/components/Game.tsx:253,506,693,711`
- Modify: `src/app/globals.css:329-406,427-433,3353-3363,3552-3574`

**Interfaces:**
- Consumes: the `.btn` base, existing `#btn-claim-score`, `#btn-spin-nft`, `#btn-starter-claim`, and `#btn-do-ci` IDs, plus dynamic copy written by `game.js`.
- Produces: `.claim-action`, a reusable class that is valid on wide `.btn` controls and focused-flow buttons; Task 3 applies it to dynamic HTML buttons.

- [ ] **Step 1: Update the tests first to require the shared primitive**

In `scripts/test-run-complete-ui.mjs`, replace the assertion that expects `.btn-claim-score` to be outlined with these assertions:

```js
assert.match(
  gameShell,
  /className="btn claim-action btn-claim-score"[^>]*id="btn-claim-score"/,
  'Run Complete should use the shared claim action',
);
assert.match(globalCss, /\.claim-action\s*\{[\s\S]*?background:\s*var\(--button-blue\)[\s\S]*?color:\s*#fff/, 'Claim actions should use the Base-blue primary treatment');
assert.doesNotMatch(globalCss, /\.btn-claim-score\s*\{[\s\S]*?background:\s*rgba\(0,82,255,0\.06\)/, 'Run Complete should not retain the former onchain-only outline');
```

Append these checks to `scripts/test-navigation-and-claim-ui.mjs`:

```js
for (const [id, label] of [
  ['btn-do-ci', 'CLAIM'],
  ['btn-starter-claim', 'CLAIM FREE'],
  ['btn-spin-nft', 'CLAIM ONCHAIN'],
]) {
  const button = new RegExp(`<button(?=[^>]*id="${id}")(?=[^>]*className="[^"]*claim-action[^"]*")[^>]*>[\\s\\S]*?${label}`);
  assert.match(shell, button, `${id} should use the shared claim action`);
}
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `node scripts/test-run-complete-ui.mjs`

Expected: failure stating `Run Complete should use the shared claim action`.

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: failure stating that `btn-do-ci` should use the shared claim action.

- [ ] **Step 3: Add the primitive and apply it to static buttons**

Add this declaration after the existing `.btn-start` CSS rule in `src/app/globals.css`; keep per-screen width and reward-chip layout rules in their existing selectors.

```css
.claim-action {
  background: var(--button-blue);
  color: #fff;
  border-color: rgba(136,170,255,0.34);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 22px rgba(0,82,255,0.24);
}

.claim-action:active {
  transform: translateY(1px) scale(0.98);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}

.claim-action:disabled {
  opacity: 0.55;
  cursor: default;
  box-shadow: none;
}

.claim-action:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
```

Change the four static buttons in `src/components/Game.tsx` exactly as follows:

```tsx
<button type="button" className="btn claim-action btn-claim-score" id="btn-claim-score">CLAIM ONCHAIN</button>
<button className="spin-nft-btn claim-action" id="btn-spin-nft">CLAIM ONCHAIN</button>
<button id="btn-starter-claim" className="starter-claim-btn claim-action">CLAIM FREE</button>
<button className="btn claim-action" id="btn-do-ci">CLAIM</button>
```

Remove the old light-blue/outlined background declarations from `.btn-claim-score`, `.spin-nft-btn`, and `.starter-claim-btn`, but retain their dimensions, spacing, and screen-specific layout. Keep `#btn-do-ci` reward-chip and disabled selectors; its normal Base-blue declaration now comes from `.claim-action`.

- [ ] **Step 4: Verify the primitive is green**

Run: `node scripts/test-run-complete-ui.mjs`

Expected: `run complete UI checks passed`.

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: `navigation and claim UI checks passed`.

- [ ] **Step 5: Commit the static Claim foundation**

```bash
git add src/app/globals.css src/components/Game.tsx scripts/test-run-complete-ui.mjs scripts/test-navigation-and-claim-ui.mjs
git commit -m "feat: unify static claim actions"
```

## Task 3: Apply the Claim primitive to dynamic Quest and NFT claims

**Files:**
- Modify: `scripts/test-navigation-and-claim-ui.mjs`
- Modify: `public/game/game.js:6217-6241,6405-6410,6535-6550,7661-7707,7886-7931,8778-8786,9432-9435,9652-9655,10250-10260,11196-11200,11222-11244`
- Modify: `src/app/globals.css:1910-1938,2173-2181,3391-3401`

**Interfaces:**
- Consumes: `.claim-action` from Task 2; existing classes `.shop-btn`, `.shop-nft-btn`, `.quest-claim-btn`, `.spin-nft-btn`, `.levelup-nft-btn`; existing mint/quest handlers and their `disabled` guards.
- Produces: all dynamically generated Claim controls carry `claim-action`, use consistent uppercase copy, retain explicit `ONCHAIN` copy for NFT/score transactions, and render a mint completion label.

- [ ] **Step 1: Add failing dynamic-Claim assertions**

Append the following checks to `scripts/test-navigation-and-claim-ui.mjs` after the static checks:

```js
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
```

- [ ] **Step 2: Run the contract and verify the expected failure**

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: failure stating `Generic Shop NFT claims should use the shared onchain action`.

- [ ] **Step 3: Update dynamic markup and state copy without touching claim authority**

Make these exact source changes in `public/game/game.js`:

```js
return `<button class="shop-nft-btn claim-action" data-id="${itemId}">CLAIM ONCHAIN</button>`;

actionHtml = `<button class="shop-btn claim-action shop-btn-claim-equip" data-id="${item.id}">CLAIM ONCHAIN</button>`;
actionHtml = `<button class="shop-btn claim-action shop-btn-claim-equip-trail" data-id="${item.id}">CLAIM ONCHAIN</button>`;

? `<button class="quest-claim-btn claim-action" data-id="${context.questId}"${isPending ? ' disabled' : ''}>${isPending ? 'CLAIMING...' : 'CLAIM'}</button>`

btn.className = 'levelup-nft-btn claim-action';
btn.textContent = 'CLAIM ONCHAIN';
```

Normalize the matching lifecycle labels without changing their guards:

```js
btn.textContent = 'CLAIMING...';
claimBtn.textContent = 'CLAIM FREE';
mintBtn.textContent = 'CLAIM ONCHAIN';
spinMintBtn.textContent = 'CLAIM ONCHAIN';
```

Use the same completion copy at every existing completed-claim surface:

```js
claimed: '✓ CLAIMED',
? '<span class="quest-done">✓ CLAIMED</span>'
claimBtn.textContent = '✓ CLAIMED';
```

The first line belongs to the `renderRunComplete` label map, the second replaces the existing Quest completed status, and the third replaces the existing Check-in `✓ Claimed today` text.

In the existing global `nft-minted` event handler, replace the Daily Spin success copy and add a level-up success update that only changes the matching claimed reward:

```js
if (spinMintBtn) { spinMintBtn.textContent = '✓ CLAIMED'; spinMintBtn.disabled = true; }

const levelupMintBtn = document.querySelector('.levelup-nft-btn');
if (levelupMintBtn?.dataset.id === itemId) {
  levelupMintBtn.textContent = '✓ CLAIMED';
  levelupMintBtn.disabled = true;
}
```

In the existing `nft-mint-error` event handler, reset a disabled `.levelup-nft-btn` to `CLAIM ONCHAIN` and re-enable it. Change all Shop NFT completion copies from `✓ On-chain` to `✓ CLAIMED`. Keep `window.__NFT_PENDING`, the existing `disabled = true` assignments, and all mint/quest call sites unchanged.

In `src/app/globals.css`, remove the conflicting light-outline background/color/box-shadow declarations from `.shop-btn-claim-equip`, `.shop-btn-claim-equip-trail`, `.shop-nft-btn`, `.quest-claim-btn`, `.spin-nft-btn`, and `.levelup-nft-btn`. Retain their local width, margin, and text-size declarations so card layouts do not reflow. Let `.claim-action` own normal, active, disabled, and focus colours.

- [ ] **Step 4: Extend the Run Complete regression check and verify all contracts**

In `scripts/test-run-complete-runtime.mjs`, retain the existing visible-claim test and add this assertion in its `renderRunComplete` source check:

```js
match(render, /claimScoreBtn\.textContent = labels\[snapshot\.claimState\] \|\| labels\.idle;/);
```

Run: `node scripts/test-navigation-and-claim-ui.mjs`

Expected: `navigation and claim UI checks passed`.

Run: `node scripts/test-run-complete-ui.mjs`

Expected: `run complete UI checks passed`.

Run: `node scripts/test-run-complete-runtime.mjs`

Expected: `run complete runtime checks passed`.

Run: `node --check public/game/game.js`

Expected: exit code 0.

- [ ] **Step 5: Commit the dynamic Claim rollout**

```bash
git add public/game/game.js src/app/globals.css scripts/test-navigation-and-claim-ui.mjs scripts/test-run-complete-runtime.mjs
git commit -m "feat: unify dynamic claim actions"
```

## Task 4: Verify the complete navigation and Claim experience

**Files:**
- Modify only if verification identifies a failure: the exact file named by the failing contract.

**Interfaces:**
- Consumes: sticky header contract from Task 1 and `claim-action` contract from Tasks 2 and 3.
- Produces: fresh evidence that the changed UI builds and that no completed/pending claim can be submitted twice.

- [ ] **Step 1: Run all focused automated checks**

Run each command separately:

```bash
node scripts/test-navigation-and-claim-ui.mjs
node scripts/test-run-complete-ui.mjs
node scripts/test-run-complete-runtime.mjs
node scripts/test-xp-presentation.mjs
node --check public/game/game.js
```

Expected: each command exits 0 and prints its success line.

- [ ] **Step 2: Perform responsive browser verification**

Use the in-app browser at a 320 px wide mobile viewport and a short-height viewport. Verify these exact scenarios:

1. Scroll Shop, Quests, Leaders, and Profile to their final cards; `← HOME` remains visible, its 44 px target is tappable, and no final card is covered by the fixed Hub navigation.
2. Move Shop → Quests → Shop via the bottom Hub navigation; Shop stays at its previous scroll position.
3. Confirm `CLAIM` is visually Base Blue in a claimable quest and Daily Check-in; Starter Pack reads `CLAIM FREE`; Run Complete, Shop NFT, Daily Spin NFT, and Level-up NFT read `CLAIM ONCHAIN` in the same Base-blue style.
4. With reduced motion enabled, headers and Claim actions remain usable with no continuous animation introduced by this change. The focused runtime contract from Step 1 remains the authority for duplicate-submit and pending-claim behaviour.

- [ ] **Step 3: Run repository-wide quality gates**

Run each command separately:

```bash
npm run lint
npm run build
git diff --check
git status --short
```

Expected: lint has no errors (pre-existing warnings may remain); the production build exits 0; whitespace check exits 0; status contains no unexpected files beyond the known user-owned untracked directories.

- [ ] **Step 4: Commit only if verification required a corrective code change**

```bash
git add src/app/globals.css src/components/Game.tsx public/game/game.js scripts/test-navigation-and-claim-ui.mjs scripts/test-run-complete-ui.mjs scripts/test-run-complete-runtime.mjs
git commit -m "fix: polish navigation and claim actions"
```

If no corrective edit was necessary, do not create an empty commit.
