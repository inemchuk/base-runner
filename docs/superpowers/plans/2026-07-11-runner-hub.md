# Runner Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent Runner Hub and redesign Shop, Profile, and Quests, including server-authoritative daily and weekly quest rotations with capped rewards.

**Architecture:** Keep the existing React shell and vanilla game modules. Move the existing five-button navigation into a shared fixed shell controlled by `UI.show`, extend the current quest state with period-scoped rotations, and preserve all legacy Career keys and client bridges.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, vanilla JavaScript game modules, global CSS, Node test runner.

## Global Constraints

- Do not reset existing coins, shop ownership, level, or `quests_v1` data.
- Do not change onchain check-in, NFT mint, or transaction hooks.
- Do not change shop prices, craft requirements, or collectible authority.
- Do not start the development server without explicit user permission.
- Keep mobile rendering light: no continuous DOM animation or expensive hub blur.

---

### Task 1: Period-scoped quest model

**Files:**
- Create: `src/lib/economy/quests.test.ts`
- Modify: `src/lib/economy/quests.ts`

**Interfaces:**
- Produces: `getQuestPeriods(now)`, `getActiveRotations(scope, period)`, extended `QuestState`, period-aware `updateQuestProgressFromRun`, and scoped `claimQuestReward`.

- [ ] Write tests for legacy normalization, deterministic 3/2 selection, period reset, accepted-run progress, and scoped reward claims.
- [ ] Run `node --test --experimental-strip-types src/lib/economy/quests.test.ts` and verify the tests fail because rotation APIs are absent.
- [ ] Implement the minimal typed quest rotation model while preserving the five existing Career entries.
- [ ] Re-run the quest tests and existing economy tests.

### Task 2: Server claim and XP persistence

**Files:**
- Modify: `src/app/api/economy/claim/route.ts`
- Modify: `src/hooks/useEconomySync.ts`

**Interfaces:**
- Consumes: period-scoped quest claims and `addXpToLevelState`.
- Produces: claim responses containing reconciled `quests`, `levels`, `shop`, and `coins`.

- [ ] Add a failing quest-model test proving stale-period claims are rejected.
- [ ] Read and write level state when a quest reward contains XP.
- [ ] Return level state and level-ups from the claim route and update the client response type.
- [ ] Re-run quest and economy tests.

### Task 3: Shared Runner Hub shell

**Files:**
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `#runner-hub-nav`, active tab state from `UI.show`, and fixed bottom clearance on hub screens.

- [ ] Add a source-level test script assertion for one shared navigation instance and required tab IDs.
- [ ] Move the existing tab bar outside the menu screen, retain button IDs, and remove Shop/Profile/Quests Back controls.
- [ ] Update `UI.show` to show the nav only on hub destinations and set `aria-current`/active classes.
- [ ] Add responsive, focus-visible, safe-area, and reduced-motion styles.
- [ ] Run JavaScript syntax, TypeScript/build, and whitespace checks.

### Task 4: Shop Runner Stage

**Files:**
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: stage preview IDs updated by the existing Shop module and upgraded catalog cards without changing purchase behavior.

- [ ] Add static shell assertions for the stage and economy header IDs.
- [ ] Build the Runner Stage and update it from equipped skin/collection state on every Shop render.
- [ ] Restyle the category control and catalog hierarchy while preserving all existing action selectors.
- [ ] Verify shop focus, purchase, claim, equip, and scroll selectors remain present.

### Task 5: Runner Passport profile

**Files:**
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: performance trio, compact Career block, collection summary, and dynamic next unlock.

- [ ] Add static shell assertions for Career and next-unlock IDs.
- [ ] Recompose existing stat IDs without changing their data sources.
- [ ] Extend XP rendering with the next milestone and update collection counts from Shop state.
- [ ] Verify gear cycling, avatar resolution, rank refresh, and rewards sheet bindings.

### Task 6: Daily, weekly, and Career quest UI

**Files:**
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: extended quest state and active rotation definitions.
- Produces: grouped quest rendering, UTC reset labels, scoped claim requests, and claimable badges.

- [ ] Add static shell assertions for Daily, Weekly, and Career containers.
- [ ] Port the server rotation definitions and period rules into the offline client module.
- [ ] Render three compact groups with reset context and preserve optimistic/server reconciliation.
- [ ] Verify claimable detection includes all scopes and profile Career reads legacy top-level counters.

### Task 7: Full verification and visual self-critique

**Files:**
- Modify only files needed to fix issues found by verification.

- [ ] Run `node --test --experimental-strip-types src/lib/economy/*.test.ts`.
- [ ] Run `node --check public/game/game.js`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Inspect the rendered interface without starting a new dev server; if no existing browser target is available, document that visual QA remains for the user's running instance.
- [ ] Review the diff for accidental edits to pre-existing user changes.

### Task 8: Stable Play action, header Home controls, and unified Leaders

**Files:**
- Modify: `scripts/test-runner-hub.mjs`
- Modify: `src/components/Game.tsx`
- Modify: `public/game/game.js`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `UI.show(name)`, `goToMenu()`, `Loadout.show()`, and the shared `#runner-hub-nav`.
- Produces: a stable center Play action, four `.hub-home-btn` header controls, plus Leaders as a persistent hub screen.

- [ ] Extend shell assertions to require `lb` in `HUB_SCREENS`, no `#btn-lb-back`, a shared Leaders heading, a permanent Play icon, and four Home controls.
- [ ] Run `node scripts/test-runner-hub.mjs` and verify it fails on the contextual Home implementation.
- [ ] Keep the center action wired directly to Loadout and bind the four header Home controls to Menu.
- [ ] Recompose Leaders with `runner-hub-scroll` and remove its Back bar without changing leaderboard tabs or list IDs.
- [ ] Add Home-icon and Leaders spacing styles, then run shell, syntax, lint, build, and whitespace verification.
