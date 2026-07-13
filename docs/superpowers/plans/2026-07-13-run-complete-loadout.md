# Run Complete Loadout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Replace the separate Game Over dead end with a run-scoped `RUN COMPLETE` mode of the existing Loadout screen, including result reconciliation, next-run choices, and a stale-safe `CLAIM ONCHAIN` action.

**Architecture:** A small pure TypeScript coordinator owns the monotonically increasing `runId`, completion phase, result snapshot, and claim state. The classic `public/game/game.js` engine asks that coordinator to finalize and present once, then only patches the visible matching snapshot when the score server responds. The existing Loadout DOM is shared between standalone and Run Complete modes, so there is one set of gear, booster, and action controls and one consumption path.

**Tech Stack:** Next.js 16.2 App Router, React 19 client hooks, TypeScript, classic browser JavaScript game engine, CSS, Node `node:test` with `--experimental-strip-types`.

## Global Constraints

- Keep exactly one `#screen-loadout`, one set of `loadout-*` controls, and one `#btn-claim-score`; do not clone controls or bind handlers during render.
- Main-menu Play still opens standalone `LOADOUT`; a terminal death opens `RUN COMPLETE` on the same DOM; `START NEXT RUN` starts directly through the existing Loadout consumption path.
- Every run receives a monotonically increasing `runId` before gameplay can emit events. Completion side effects and presentation happen at most once for that ID.
- Initial presentation and authoritative reconciliation are separate: reconciliation may update fields but may not call `UI.show`, replay motion, change scroll/focus, reset the next-run draft, or reset claim state.
- Continue accept returns the same run from ending to playing; Continue decline and timeout are harmless if both fire.
- Preserve all economy formulas, rewards, eligibility, quest rules, rating thresholds, booster semantics, wallet providers, and contracts.
- Claim calls and events carry both `runId` and score. Events from an older claim cannot mutate a newer result.
- Score session tokens are keyed by `runId`; submitting run A must never consume or clear run B's token.
- The final canvas frame remains visible below a navy veil. Use the existing arcade typography/tokens, Base-blue primary action, outlined Claim action, 180 ms one-shot entrance, and no continuous animation.
- All conditional content remains reachable at 360x640, 390x844, and the app's capped 430x390 landscape viewport; honor safe-area insets and reduced motion.
- Do not touch the user-owned untracked `public/game/chars/backups-before-full-rework/`, `public/game/chars/rework/`, or `tmp/` directories.
- The relevant local Next 16 guides under `node_modules/next/dist/docs/` have priority over remembered framework behavior.
- Baseline exceptions are pre-existing: `scripts/verify-loadout.mjs` currently fails on its `gem` icon assertion, and full `tsc --noEmit` currently fails in `src/lib/economy/quests.test.ts` reward-union accesses. Do not hide new failures behind these exceptions.

---

## Task 1: Build the run-completion coordinator with behavioral tests

**Files:**

- Create: `src/lib/client/runCompleteFlow.ts`
- Create: `src/lib/client/runCompleteFlow.test.ts`

- [ ] **Step 1: Write the failing tests first**

Cover these contracts with `node:test` and `node:assert/strict`:

```ts
const flow = createRunCompleteFlow();
const runId = flow.beginRun();
assert.equal(flow.markEnding(runId), true);
assert.equal(flow.finalizeRun(runId), true);
assert.equal(flow.finalizeRun(runId), false);
assert.ok(flow.presentRun(runId, localResult));
assert.equal(flow.presentRun(runId, localResult), null);
```

Also test Continue resume, a decline/timeout double-finalize, stale patch after `beginRun`, stale patch after `leaveRun`, claim double-start, authoritative patch preserving `claimState`, and stale claim events with a reused score.

- [ ] **Step 2: Run the test and observe RED**

Run: `node --test --experimental-strip-types src/lib/client/runCompleteFlow.test.ts`

Expected: failure because `runCompleteFlow.ts` does not exist.

- [ ] **Step 3: Implement the minimum pure coordinator**

Use this public shape:

```ts
export type RunClaimState = 'idle' | 'claiming' | 'confirming' | 'claimed';
export type RunCompletePhase = 'idle' | 'playing' | 'ending' | 'finalized' | 'presented' | 'left';

export type RunCompleteSnapshot = {
  runId: number;
  score: number;
  previousBest: number;
  best: number;
  isNewRecord: boolean;
  sessionCoins: number;
  xpEarned: number;
  xpBreakdown: Record<string, unknown> | null;
  rating: { id: string; label?: string } | null;
  hasClaimableQuest: boolean;
  canClaimOnchain: boolean;
  claimState: RunClaimState;
};

export type RunCompleteFlow = ReturnType<typeof createRunCompleteFlow>;
```

The returned API is `beginRun`, `markEnding`, `resumeRun`, `finalizeRun`, `presentRun`, `patchRun`, `beginClaim`, `applyClaimState`, `leaveRun`, `isPresentedRun`, `getActiveRunId`, and `getSnapshot`. Clone snapshots on return. `patchRun` accepts only defined result fields and always preserves `runId`, score identity, and `claimState`.

- [ ] **Step 4: Run GREEN and type-check the files in isolation**

Run:

```bash
node --test --experimental-strip-types src/lib/client/runCompleteFlow.test.ts
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --module nodenext --moduleResolution nodenext --target es2022 src/lib/client/runCompleteFlow.ts src/lib/client/runCompleteFlow.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/runCompleteFlow.ts src/lib/client/runCompleteFlow.test.ts
git commit -m "test: define idempotent run completion flow"
```

---

## Task 2: Expose run-scoped React bridges for completion, sessions, and claims

**Files:**

- Create: `src/lib/client/runSessionTokens.ts`
- Create: `src/lib/client/runSessionTokens.test.ts`
- Modify: `src/components/Game.tsx`
- Modify: `src/hooks/useLeaderboard.ts`
- Modify: `src/hooks/useScoreClaim.ts`

- [ ] **Step 1: Write failing token-registry tests**

Test that `start(runA, promiseA)` and `start(runB, promiseB)` can resolve out of order, `take(runA)` returns only A, and deleting A leaves B available. Test invalid/non-positive IDs are rejected.

- [ ] **Step 2: Run RED**

Run: `node --test --experimental-strip-types src/lib/client/runSessionTokens.test.ts`

- [ ] **Step 3: Implement the token registry**

```ts
export function createRunSessionTokens() {
  const requests = new Map<number, Promise<string | null>>();
  return {
    start(runId: number, request: Promise<string | null>): Promise<void>,
    take(runId: number): Promise<string | null>,
    clear(): void,
  };
}
```

Deleting happens by the exact run ID being taken, never by clearing a shared ref.

- [ ] **Step 4: Publish one coordinator instance from `Game.tsx`**

Create it lazily with a ref and expose it as `window.__BASE_RUN_COMPLETE_FLOW` in an effect; delete only the same instance during cleanup. Update the auto-submit bridge detail and signature to `(runId, score, sessionCoins)`.

- [ ] **Step 5: Key leaderboard session requests**

Change the browser contracts to:

```ts
__BASE_SESSION_START?: (runId: number) => Promise<void>;
__BASE_SUBMIT_SCORE?: (runId: number, score: number, sessionCoins?: number) => Promise<unknown>;
```

`fetchSessionToken(runId)` stores its own request; `submit(runId, score, coins)` awaits and consumes only that token. Clear the registry when the connected address changes/unmounts.

- [ ] **Step 6: Key score-claim calls and events**

Change the claim bridge to `__BASE_CLAIM_SCORE(runId, score)`. Keep the active `{runId, score}` in a ref. Dispatch:

```ts
new CustomEvent('base-score-claim-state', {
  detail: { runId, score, state: 'confirming' | 'idle' },
});
new CustomEvent('base-score-claimed', { detail: { runId, score } });
```

Paymaster success/failure and fallback receipt success/error must use the captured identity. A submitted transaction can finish after navigation, but no event may omit identity.

- [ ] **Step 7: Run focused tests and lint changed TypeScript**

Run:

```bash
node --test --experimental-strip-types src/lib/client/runCompleteFlow.test.ts src/lib/client/runSessionTokens.test.ts
npx eslint src/components/Game.tsx src/hooks/useLeaderboard.ts src/hooks/useScoreClaim.ts src/lib/client/runCompleteFlow.ts src/lib/client/runSessionTokens.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/components/Game.tsx src/hooks/useLeaderboard.ts src/hooks/useScoreClaim.ts src/lib/client/runSessionTokens.ts src/lib/client/runSessionTokens.test.ts
git commit -m "feat: scope run bridges by attempt"
```

---

## Task 3: Reshape the shared Loadout DOM into standalone and Run Complete modes

**Files:**

- Modify: `src/components/Game.tsx`
- Modify: `src/app/globals.css`
- Create: `scripts/test-run-complete-ui.mjs`
- Modify: `scripts/verify-loadout.mjs`

- [ ] **Step 1: Write a failing structural UI contract**

Assert that the shell contains one `screen-loadout`, no `screen-gameover`, one `btn-claim-score`, one set of Loadout gear/booster IDs, `loadout-scroll`, `run-complete-result`, `go-score`, `go-best`, rating/reward/quest rows, `loadout-inline-message[aria-live="polite"]`, and accessible Claim/Start/Menu buttons. Assert CSS contains the shared-mode class, 180 ms entrance, safe-area padding, short-landscape layout, and a reduced-motion override.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-run-complete-ui.mjs`

- [ ] **Step 3: Replace the old Game Over markup with one result card inside Loadout**

The hierarchy is:

```text
#screen-loadout.loadout-screen
  .loadout-panel
    .loadout-head
    .loadout-scroll
      #run-complete-result.hidden
      #loadout-gear
      .loadout-grid
      #loadout-build-summary
      #loadout-inline-message[aria-live=polite]
    .loadout-actions
      #btn-loadout-start
      #btn-loadout-back
```

The result card contains large `STEPS`, record/`NEW RECORD`, rating, coins, XP breakdown, quest CTA, and the full-width outlined `CLAIM ONCHAIN`. Remove JSX inline gear dimensions so media queries can compact them.

- [ ] **Step 4: Implement the visual states**

Standalone mode shows `LOADOUT`, build summary, and `START RUN`. `.loadout-run-complete` shows `RUN COMPLETE`, the result card, hides the redundant build summary, and labels the primary action `START NEXT RUN`.

Make header and actions fixed around one scrolling content region. Use a navy `::before` veil and one 180 ms result entrance/score emphasis. At `orientation: landscape` and `max-height: 430px`, use a compact two-column scroll layout and a single-row action bar. Under `prefers-reduced-motion: reduce`, remove translate/scale and keep only opacity.

- [ ] **Step 5: Update the existing Loadout smoke assertions**

Replace assertions for JSX inline dimensions with CSS-based responsive assertions. Keep the established Loadout behavior checks and do not make the unrelated baseline `gem` assertion broader; run the new UI contract independently.

- [ ] **Step 6: Run UI contracts**

Run:

```bash
node scripts/test-run-complete-ui.mjs
node scripts/verify-loadout.mjs
```

If the known `gem` baseline assertion still fails, record it separately; every new Run Complete assertion must pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/Game.tsx src/app/globals.css scripts/test-run-complete-ui.mjs scripts/verify-loadout.mjs
git commit -m "feat: merge run complete with loadout"
```

---

## Task 4: Integrate exactly-once completion with the game engine

**Files:**

- Modify: `public/game/game.js`
- Create: `scripts/test-run-complete-runtime.mjs`

- [ ] **Step 1: Write failing runtime contract tests**

Extract the relevant source modules or run them through `vm` with fakes. Prove:

1. repeated terminal callbacks call score/quest/submit/presentation once;
2. Continue accept resumes the same run and prevents completion for that death;
3. decline plus timeout still finalizes once;
4. server response uses `patchRunComplete`, never the presentation method;
5. starting a new run/Menu/Quest invalidates old patches and level-up timers;
6. a double Start consumes the selected boosters and initializes gameplay once;
7. stale claim events are ignored and claim double-click submits once.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-run-complete-runtime.mjs`

- [ ] **Step 3: Add the shared-screen modes to `UI` and `Loadout`**

Map logical `runcomplete` to `screen-loadout` but exclude it from `MUSIC_SCREENS`. Replace `showGameOver` with:

```js
function presentRunComplete(snapshot) {
  renderRunComplete(snapshot);
  Loadout.showRunComplete();
}

function patchRunComplete(runId, snapshot) {
  if (!window.__BASE_RUN_COMPLETE_FLOW?.isPresentedRun(runId)) return;
  renderRunComplete(snapshot);
}
```

`Loadout.show()` and `Loadout.showRunComplete()` set copy/visibility once, reset the next-run draft once, and reuse `render()`. Patching results must not call `Loadout.render()`.

- [ ] **Step 4: Validate and guard the start path**

Add a synchronous `starting` guard. Before consumption, remove any selected booster whose reconciled count is zero, render the corrected draft, show a concise inline message, clear the guard, and remain on the current screen. Otherwise consume through the existing exact path, clear transient result/level-up state, request the new run's session token, and call `initGame()` once.

- [ ] **Step 5: Allocate and transition run IDs in gameplay**

`initGame()` calls `flow.beginRun()` before setting `PLAYING`, stores the ID, and passes it to `_requestSessionToken`. The first real death calls `markEnding`. Continue accept calls `resumeRun`; a later terminal death may mark ending again. `onGameOver()` begins with `finalizeRun(runId)` and returns immediately when false, before `Save.addScore`, quests, coins, telemetry, submit, or XP side effects.

- [ ] **Step 6: Present locally once and patch authoritatively**

Build the local snapshot synchronously after the death FX and call `flow.presentRun` plus `UI.presentRunComplete` once. Delete the 600 ms presentation timeout. After submission, apply durable server data, call `flow.patchRun` with valid authoritative fields, and if it returns a snapshot call `UI.patchRunComplete`. Never call a screen-opening method from reconciliation.

- [ ] **Step 7: Scope Claim and level-up work**

Claim click calls `flow.beginClaim(runId, score)` before the bridge. Matching state/claimed events call `flow.applyClaimState` and patch the card; mismatches are no-ops. Keep level-up queue/timer ownership keyed to `runId`; clear and hide transient level-up UI when leaving for Menu, Quest, or a new run. Timer callbacks verify that their run still owns the presented result.

- [ ] **Step 8: Run runtime and syntax tests**

Run:

```bash
node scripts/test-run-complete-runtime.mjs
node --check public/game/game.js
node --test --experimental-strip-types src/lib/client/runCompleteFlow.test.ts src/lib/client/runSessionTokens.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add public/game/game.js scripts/test-run-complete-runtime.mjs
git commit -m "fix: make run completion idempotent"
```

---

## Task 5: Verify the complete flow, responsive UI, and regressions

**Files:**

- Modify only if a verification finding requires it: files from Tasks 1-4
- Create: `docs/superpowers/verification/2026-07-13-run-complete-loadout.md`

- [ ] **Step 1: Run the focused automated suite**

```bash
node --test --experimental-strip-types src/lib/client/runCompleteFlow.test.ts src/lib/client/runSessionTokens.test.ts
node scripts/test-run-complete-ui.mjs
node scripts/test-run-complete-runtime.mjs
node --check public/game/game.js
npm run rating:verify
npm run lint
npm run build
```

Run `node scripts/verify-loadout.mjs` and `npx tsc --noEmit` too, explicitly separating any unchanged baseline failures from regressions.

- [ ] **Step 2: Inspect the complete browser flow**

Using the local app, verify standalone Play -> Loadout, terminal death -> Run Complete, gear/booster changes, direct Start Next Run, Menu, Continue accept/decline/timeout, quest navigation, and Claim state. Use test hooks only on localhost.

- [ ] **Step 3: Capture responsive evidence**

Inspect 360x640, 390x844, and 844x390 (the app content is capped to 430px on desktop). Confirm the result, gear, booster, Claim, Start, and Menu controls are reachable by scroll and not covered by safe areas. Emulate reduced motion and confirm there is no translate/scale entrance.

- [ ] **Step 4: Record verification evidence**

Write commands, exit codes, known baseline exceptions, screenshots/viewport observations, and the ordinary/new-record/onchain states checked to `docs/superpowers/verification/2026-07-13-run-complete-loadout.md`.

- [ ] **Step 5: Request whole-branch review and fix every Critical/Important finding**

Generate a review package from commit `616e223` to branch HEAD. The reviewer must assess spec compliance and code quality, especially duplicate completion, stale async work, claim identity, booster consumption, and responsive reachability.

- [ ] **Step 6: Commit verification fixes/documentation**

```bash
git add docs/superpowers/verification/2026-07-13-run-complete-loadout.md
git commit -m "docs: verify run complete loadout"
```
