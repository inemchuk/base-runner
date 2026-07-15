# Shop Claim Attention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pending NFT claims in the Shop compact and easy to notice without changing other claim actions.

**Architecture:** The Shop already renders the pending-claim button and its explanatory hint separately for skins and trails. Keep the existing shared blue `claim-action` button treatment, shorten the two Shop labels to `CLAIM`, and mark only the two explanatory hints with a dedicated class. CSS owns the soft gold attention animation and disables it for reduced-motion users.

**Tech Stack:** Vanilla JavaScript runtime, CSS, Node assertion scripts, Next.js production build.

## Global Constraints

- Show `CLAIM`, never `CLAIM ONCHAIN`, for pending skin and trail NFT claims in the Shop.
- Preserve the existing compact Shop button rule: `font-size: 0.78rem` and `padding: 6px 10px`.
- Animate only the `Claim NFT to unlock` hints in Shop cards that need a claim.
- Do not change Buy, Equip, Quest, Daily Check-in, Starter Pack, or disabled/claiming controls.
- Disable the hint animation under `prefers-reduced-motion: reduce`.

---

### Task 1: Pending NFT claim rendering and attention hint

**Files:**
- Modify: `scripts/test-runner-hub.mjs:32-46`
- Modify: `scripts/test-navigation-and-claim-ui.mjs:85-93`
- Modify: `public/game/game.js:7701,7715,7926,7940`
- Modify: `src/app/globals.css:1923-1926` and after the shared claim action rules near `src/app/globals.css:3600`

**Interfaces:**
- Consumes: the existing `needsClaim` boolean in `renderSkins()` and `renderTrails()`.
- Produces: `<button ...>CLAIM</button>` and `<span class="shop-nft-unlock-hint">Claim NFT to unlock</span>` in both Shop paths; CSS selector `.shop-nft-unlock-hint` and animation `shop-nft-unlock-glow`.

- [ ] **Step 1: Write the failing regression checks**

  Add these assertions before the existing collection assertion in `scripts/test-runner-hub.mjs`:

  ```js
  assert.equal((gameRuntime.match(/shop-btn-claim-equip(?:-trail)?[^`]*>CLAIM<\\/button>/g) || []).length, 2, 'Skin and trail claims use the compact CLAIM label');
  assert.doesNotMatch(gameRuntime, /shop-btn-claim-equip(?:-trail)?[^`]*>CLAIM ONCHAIN<\\/button>/, 'Shop no longer shows the longer claim label');
  assert.equal((gameRuntime.match(/class="shop-nft-unlock-hint">Claim NFT to unlock<\\/span>/g) || []).length, 2, 'Skin and trail pending claims share the animated hint');

  const shopClaimRule = globalStyles.match(/\.shop-btn-claim-equip, \.shop-btn-claim-equip-trail\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(shopClaimRule, /font-size:\s*0\.78rem/, 'Shop claims retain their compact type size');
  assert.match(shopClaimRule, /padding:\s*6px 10px/, 'Shop claims retain their compact padding');
  const shopUnlockHintRule = globalStyles.match(/\.shop-nft-unlock-hint\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(shopUnlockHintRule, /animation:\s*shop-nft-unlock-glow/, 'Pending Shop claim hint softly glows');
  assert.match(globalStyles, /@keyframes shop-nft-unlock-glow/, 'Shop hint glow keyframes exist');
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.shop-nft-unlock-hint\s*\{[\s\S]*?animation:\s*none/, 'Reduced motion disables the Shop hint animation');

  // Update the existing Shop-specific claim assertions in
  // scripts/test-navigation-and-claim-ui.mjs to expect `CLAIM` for skins and
  // trails. Keep the generic Shop NFT, level-up, and Daily Spin onchain-copy
  // assertions unchanged.
  ```

- [ ] **Step 2: Run the regression script and verify it fails**

  Run: `node scripts/test-runner-hub.mjs`

  Expected: an assertion failure because the two Shop paths still use `CLAIM ONCHAIN` and no `.shop-nft-unlock-hint` CSS rule exists.

- [ ] **Step 3: Implement the smallest matching runtime and CSS change**

  In both pending-claim branches in `public/game/game.js`, replace the label:

  ```js
  >CLAIM ONCHAIN</button>
  ```

  with:

  ```js
  >CLAIM</button>
  ```

  In both descriptions, replace the inline styled hint with:

  ```js
  <br><span class="shop-nft-unlock-hint">Claim NFT to unlock</span>
  ```

  Append this CSS after the shared claim-action selectors in `src/app/globals.css`:

  ```css
  .shop-nft-unlock-hint {
    color: rgba(255,215,0,0.92);
    font-size: 0.7rem;
    animation: shop-nft-unlock-glow 2.4s ease-in-out infinite;
  }
  @keyframes shop-nft-unlock-glow {
    0%, 100% { opacity: 0.5; text-shadow: 0 0 0 rgba(255,215,0,0); }
    50% { opacity: 1; text-shadow: 0 0 10px rgba(255,215,0,0.62); }
  }
  @media (prefers-reduced-motion: reduce) {
    .shop-nft-unlock-hint { animation: none; }
  }
  ```

- [ ] **Step 4: Run focused checks and verify they pass**

  Run: `node scripts/test-runner-hub.mjs && node scripts/test-navigation-and-claim-ui.mjs && git diff --check`

  Expected: both scripts print their success messages and no whitespace errors are reported.

- [ ] **Step 5: Run the production build**

  Run: `npm run build`

  Expected: Next.js exits with code 0. If the sandbox blocks Turbopack from binding its local port, rerun the exact command with the required sandbox approval.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add public/game/game.js src/app/globals.css scripts/test-runner-hub.mjs docs/superpowers/plans/2026-07-15-shop-claim-attention.md
  git commit -m "feat: highlight pending shop nft claims"
  ```
