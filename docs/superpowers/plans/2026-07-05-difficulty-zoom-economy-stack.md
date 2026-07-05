# Difficulty Zoom Economy Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fair high-score difficulty system that works with zoom, then connect better runs to score-only rating, XP, daily quality, elite-run quests, and controlled economy rewards.

**Architecture:** Implement in gated layers. First extract shared constants and verification scripts, then make gameplay generation measurable and fair, then add section-level danger/complexity budgets, and only after the Phase 2B playtest gate add server-authoritative rating/economy progression. Server rewards stay in `/api/score/submit`; on-chain check-in, paymaster, spin contract config, NFT mint, and token mechanics stay untouched.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, vanilla browser runtime in `public/game/game.js`, TypeScript economy modules in `src/lib/economy`, Upstash Redis with memory fallback, shell/Node verification scripts, `npm run lint`, `npm run build`.

## Global Constraints

- Depends on Economy V1 from branch `codex/economy-v1-local-focus`; do not start from `main` until Economy V1 lands.
- `/api/quests POST` must not overwrite arbitrary client-authored quest state.
- `/api/score/submit` remains the source of accepted score, quest progress, XP, rating, and daily quality progress.
- Do not change on-chain check-in, paymaster, spin contract config, or NFT mint flows.
- Do not add token mechanics.
- Do not give Focus fragments directly for every hard lane.
- Do not make raw car speed scale forever.
- Rating V1 is score-only: `casual <40`, `good >=40`, `great >=80`, `elite >=150`, `master >=300`.
- XP multipliers: `casual 1.00`, `good 1.05`, `great 1.12`, `elite 1.20`, `master 1.28`.
- Daily quality bonus is XP-only and upgrade-based: `good +25`, `great +50`, `elite +100`, `master +150`.
- Risk coin routes are optional and cannot be the only meaningful route choice.
- Danger budget and complexity budget are separate axes.
- Mastery relief cadence and commitment length are bounded.
- Next.js 16 docs were checked locally: route handlers live under `app/**/route.ts`, POST handlers are not cached, `after()` is valid in route handlers for non-blocking telemetry.
- Do not start the local dev server automatically if the user is already running it or asks not to; verify with browser only when requested.

---

## File Structure

Create:
- `src/lib/economy/rating.ts` — canonical rating bands, XP multipliers, daily quality XP values, helper functions.
- `public/game/generated/rating-config.js` — browser-readable generated rating config for `game.js`.
- `scripts/sync-rating-config.mjs` — generates `public/game/generated/rating-config.js` from `src/lib/economy/rating.ts` via a static JSON block or TS transpilation-safe source.
- `scripts/verify-rating-config.mjs` — fails if generated browser config drifts from server rating constants.
- `scripts/simulate-difficulty.mjs` — read-only deterministic simulator for row/section generation outputs by score band.
- `docs/superpowers/playtests/difficulty-route-topology.md` — Phase 2B playtest notes and pass/fail checklist.

Modify:
- `package.json` — add scripts for rating sync/verify and difficulty simulation.
- `src/lib/economy/levels.ts` — use rating multipliers in XP calculation; return rating in XP breakdown.
- `src/lib/economy/storage.ts` — add daily quality read/write helpers with Redis and memory fallback.
- `src/lib/economy/quests.ts` — add `elite_runs`, extend run progress input with server-derived rating.
- `src/lib/economy/telemetry.ts` — add game/daily quality/elite run telemetry event names.
- `src/app/api/score/submit/route.ts` — compute rating from accepted score, update quests/levels/daily quality, return rating and daily quality result.
- `src/components/Game.tsx` — load generated rating config before `game.js`; add Game Over markup for rating and daily bonus rows.
- `src/app/globals.css` — style rating badge and daily quality row in the existing premium arcade style.
- `public/game/game.js` — consume generated rating config, cap speed spikes, add death/run summary, section budgets, route topology, risk coin routes, game-over presentation, and local fallback alignment.

Do not modify:
- `src/config/checkin-contract.ts`
- `src/config/spin-contract.ts`
- `src/hooks/useCheckIn.ts` unless a compile error requires a type-only adjustment.
- `src/hooks/useDailySpin.ts` unless a compile error requires a type-only adjustment.
- `src/hooks/useNftMint.ts`

---

### Task 1: Prerequisite And Baseline Guard

**Files:**
- Read: `src/lib/economy/levels.ts`
- Read: `src/lib/economy/quests.ts`
- Read: `src/app/api/score/submit/route.ts`
- Read: `src/app/api/quests/route.ts`
- Modify: `docs/superpowers/playtests/difficulty-route-topology.md`

**Interfaces:**
- Consumes: current Economy V1 server progression.
- Produces: a written go/no-go baseline proving the branch is safe to implement on.

- [ ] **Step 1: Verify Economy V1 prerequisites**

Run:

```bash
rg -n "updateLevelProgressFromRun|updateQuestProgressFromRun|ignored: true|writeQuestState|writeLevelState" src/lib/economy src/app/api/score/submit src/app/api/quests
```

Expected:

```text
src/app/api/score/submit/route.ts contains updateLevelProgressFromRun, updateQuestProgressFromRun, writeQuestState, writeLevelState
src/app/api/quests/route.ts contains ignored: true in the POST response
```

- [ ] **Step 2: Create playtest baseline document**

Create `docs/superpowers/playtests/difficulty-route-topology.md`:

```markdown
# Difficulty Route Topology Playtest

Date:
Branch:

## Baseline Before Implementation

- Economy V1 prerequisite checked:
- `/api/quests POST` cannot overwrite quest progress:
- `/api/score/submit` updates quests and levels:
- Current best known issues:

## Phase 2B Gate

- Score `150+` sampled sections regularly expose at least 2 viable survival lines:
- Score `300+` runs feel planning-heavy rather than reaction-only:
- Score `300-800` does not feel flat after speed caps:
- Deaths remain explainable:
- Risk coin routes are not counted as the only meaningful branch:

## Manual Phone Checks

- Viewport:
- Score band:
- Notes:
```

- [ ] **Step 3: Run baseline verification**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/playtests/difficulty-route-topology.md
git commit -m "docs: add difficulty topology playtest gate"
```

---

### Task 2: Shared Rating Constants And Drift Verifier

**Files:**
- Create: `src/lib/economy/rating.ts`
- Create: `scripts/sync-rating-config.mjs`
- Create: `scripts/verify-rating-config.mjs`
- Create: `public/game/generated/rating-config.js`
- Modify: `package.json`
- Modify: `src/components/Game.tsx`

**Interfaces:**
- Produces: `getRunRating(score: unknown): RunRating`
- Produces: `getRatingXpMultiplier(rating: RunRating): number`
- Produces: `getDailyQualityTargetXp(rating: RunRating): number`
- Produces browser global: `window.__BASE_RATING_CONFIG`

- [ ] **Step 1: Add canonical rating module**

Create `src/lib/economy/rating.ts`:

```ts
export type RunRating = 'casual' | 'good' | 'great' | 'elite' | 'master';

export interface RunRatingDef {
  id: RunRating;
  label: string;
  minScore: number;
  xpMultiplier: number;
  dailyQualityXp: number;
}

export const RUN_RATING_DEFS = [
  { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1.0, dailyQualityXp: 0 },
  { id: 'good', label: 'Good', minScore: 40, xpMultiplier: 1.05, dailyQualityXp: 25 },
  { id: 'great', label: 'Great', minScore: 80, xpMultiplier: 1.12, dailyQualityXp: 50 },
  { id: 'elite', label: 'Elite', minScore: 150, xpMultiplier: 1.2, dailyQualityXp: 100 },
  { id: 'master', label: 'Master', minScore: 300, xpMultiplier: 1.28, dailyQualityXp: 150 },
] as const satisfies readonly RunRatingDef[];

export function getRunRating(score: unknown): RunRating {
  const normalized = Math.max(0, Math.floor(Number(score) || 0));
  let rating: RunRating = 'casual';
  for (const def of RUN_RATING_DEFS) {
    if (normalized >= def.minScore) rating = def.id;
  }
  return rating;
}

export function getRatingDef(rating: RunRating): RunRatingDef {
  return RUN_RATING_DEFS.find((def) => def.id === rating) ?? RUN_RATING_DEFS[0];
}

export function getRatingXpMultiplier(rating: RunRating): number {
  return getRatingDef(rating).xpMultiplier;
}

export function getDailyQualityTargetXp(rating: RunRating): number {
  return getRatingDef(rating).dailyQualityXp;
}
```

- [ ] **Step 2: Add browser config generation script**

Create `scripts/sync-rating-config.mjs`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const defs = [
  { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1.0, dailyQualityXp: 0 },
  { id: 'good', label: 'Good', minScore: 40, xpMultiplier: 1.05, dailyQualityXp: 25 },
  { id: 'great', label: 'Great', minScore: 80, xpMultiplier: 1.12, dailyQualityXp: 50 },
  { id: 'elite', label: 'Elite', minScore: 150, xpMultiplier: 1.2, dailyQualityXp: 100 },
  { id: 'master', label: 'Master', minScore: 300, xpMultiplier: 1.28, dailyQualityXp: 150 },
];

const out = resolve('public/game/generated/rating-config.js');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `window.__BASE_RATING_CONFIG = ${JSON.stringify({ ratings: defs }, null, 2)};\n`,
);
```

- [ ] **Step 3: Add drift verifier**

Create `scripts/verify-rating-config.mjs`:

```js
import { readFileSync } from 'node:fs';

const ts = readFileSync('src/lib/economy/rating.ts', 'utf8');
const generated = readFileSync('public/game/generated/rating-config.js', 'utf8');

for (const expected of [
  "'casual'",
  "'good'",
  "'great'",
  "'elite'",
  "'master'",
  'minScore: 40',
  'minScore: 80',
  'minScore: 150',
  'minScore: 300',
  'xpMultiplier: 1.28',
  'dailyQualityXp: 150',
]) {
  if (!ts.includes(expected)) {
    throw new Error(`rating.ts missing ${expected}`);
  }
}

for (const expected of [
  '"id": "casual"',
  '"id": "good"',
  '"id": "great"',
  '"id": "elite"',
  '"id": "master"',
  '"minScore": 300',
  '"xpMultiplier": 1.28',
  '"dailyQualityXp": 150',
]) {
  if (!generated.includes(expected)) {
    throw new Error(`generated rating config missing ${expected}`);
  }
}

console.log('rating config verified');
```

- [ ] **Step 4: Add package scripts**

Modify `package.json` scripts:

```json
"rating:sync": "node scripts/sync-rating-config.mjs",
"rating:verify": "npm run rating:sync && node scripts/verify-rating-config.mjs"
```

- [ ] **Step 5: Load generated config before game runtime**

Modify `src/components/Game.tsx`:

```tsx
<Script src="/game/generated/rating-config.js" strategy="beforeInteractive" />
<Script src="/game/game.js" strategy="afterInteractive" />
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run rating:verify
npm run lint
npm run build
```

Expected:

```text
rating config verified
lint exits 0
build exits 0
```

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/sync-rating-config.mjs scripts/verify-rating-config.mjs src/lib/economy/rating.ts public/game/generated/rating-config.js src/components/Game.tsx
git commit -m "feat(economy): add shared run rating constants"
```

---

### Task 3: Difficulty Simulator And Speed Caps

**Files:**
- Create: `scripts/simulate-difficulty.mjs`
- Modify: `package.json`
- Modify: `public/game/game.js`

**Interfaces:**
- Produces script command: `npm run difficulty:sim`
- Produces runtime helpers inside `game.js`: `getDifficultyStage(score)`, `getLaneArchetype(score)`, capped rush/siren speeds.

- [ ] **Step 1: Add simulator script**

Create `scripts/simulate-difficulty.mjs`:

```js
const scores = [0, 40, 80, 100, 150, 250, 300, 450, 650];

function smoothProgress(score, start, end) {
  const t = Math.max(0, Math.min(1, (score - start) / (end - start)));
  return t * (2 - t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function stage(score) {
  if (score < 40) return 'onboarding';
  if (score < 100) return 'baseline';
  if (score < 150) return 'transition';
  if (score < 300) return 'skill';
  return 'mastery';
}

for (const score of scores) {
  const p = smoothProgress(score, 0, 250);
  const base = lerp(60, 100, p);
  const rush = Math.min(base * 1.4, 150);
  const siren = 330;
  console.log(JSON.stringify({ score, stage: stage(score), baseSpeed: Math.round(base), rushSpeed: Math.round(rush), sirenSpeed: siren }));
}
```

- [ ] **Step 2: Add package script**

Modify `package.json`:

```json
"difficulty:sim": "node scripts/simulate-difficulty.mjs"
```

- [ ] **Step 3: Run simulator before runtime change**

Run:

```bash
npm run difficulty:sim
```

Expected: output includes score bands `0`, `100`, `150`, `300`, `650`, with rush speed capped around `150` and siren speed `330`.

- [ ] **Step 4: Cap rush speed in `getDifficulty()`**

In `public/game/game.js`, change rush return values:

```js
const rushSpeedBase = Math.min(carSpeedBase * 1.4, 150);
return {
  carCount,
  carDistMin,
  carDistMax,
  logCount:     weightedPick([5, 6, 7], [30, 50, 20]),
  carSpeedBase: rushSpeedBase,
  carSpeedVar:  10,
  logSpeedBase,
  logSpeedVar,
  isFast: true,
  archetype: 'rush_road',
};
```

- [ ] **Step 5: Cap siren speed**

In `updateSirenEvent()`, replace `const speed = lane.speed * 2.5;` with:

```js
const sirenAbs = Math.min(Math.abs(lane.speed) * 2.0, 330);
const speed = sirenAbs * lane.dir;
```

- [ ] **Step 6: Add stage helper for future tasks**

Near `smoothProgress()` in `public/game/game.js`, add:

```js
function getDifficultyStage(score) {
  if (score < 40) return 'onboarding';
  if (score < 100) return 'baseline';
  if (score < 150) return 'transition';
  if (score < 300) return 'skill';
  return 'mastery';
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run difficulty:sim
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/simulate-difficulty.mjs public/game/game.js
git commit -m "feat(game): cap speed spikes for fair difficulty"
```

---

### Task 4: Death And Run Summary Foundation

**Files:**
- Modify: `public/game/game.js`

**Interfaces:**
- Produces browser-only run summary object:

```js
{
  highestStage: 'onboarding' | 'baseline' | 'transition' | 'skill' | 'mastery',
  deathCause: 'road' | 'train' | 'water' | 'unknown',
  deathRowType: string | null,
  boostersUsed: string[],
}
```

- [ ] **Step 1: Add run summary state**

Near `_sessionCoins`, add:

```js
let _runSummary = null;

function _resetRunSummary() {
  _runSummary = {
    highestStage: 'onboarding',
    deathCause: 'unknown',
    deathRowType: null,
    boostersUsed: [],
  };
}
```

- [ ] **Step 2: Reset summary on run start**

Where the run reset currently sets `_sessionCoins = 0`, add:

```js
_resetRunSummary();
```

- [ ] **Step 3: Track highest difficulty stage**

Where score changes during a run, add:

```js
if (_runSummary) _runSummary.highestStage = getDifficultyStage(Player.getScore());
```

- [ ] **Step 4: Classify death cause conservatively**

At the collision/death call site, set:

```js
function _markDeathCause(row) {
  if (!_runSummary || !row) return;
  _runSummary.deathRowType = row.type || null;
  if (row.type === 'train') _runSummary.deathCause = 'train';
  else if (row.type === 'water') _runSummary.deathCause = 'water';
  else if (row.type === 'road') _runSummary.deathCause = 'road';
  else _runSummary.deathCause = 'unknown';
}
```

Call `_markDeathCause(row)` immediately before the existing death trigger.

- [ ] **Step 5: Include summary in local telemetry dispatch only**

On game over, before submitting score, dispatch:

```js
window.dispatchEvent(new CustomEvent('base-game-run-summary', {
  detail: { score, sessionCoins: _sessionCoins, summary: _runSummary },
}));
```

Do not send row counts as economy-bearing data.

- [ ] **Step 6: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add public/game/game.js
git commit -m "feat(game): add run summary classification"
```

---

### Task 5: Section Budgets And Survival Route Topology

**Files:**
- Modify: `public/game/game.js`
- Modify: `scripts/simulate-difficulty.mjs`
- Modify: `docs/superpowers/playtests/difficulty-route-topology.md`

**Interfaces:**
- Produces runtime section object:

```js
{
  id: number,
  stage: string,
  rows: string[],
  dangerBudget: number,
  complexityBudget: number,
  features: string[],
}
```

- [ ] **Step 1: Extend simulator with budget bands**

In `scripts/simulate-difficulty.mjs`, add:

```js
const budgets = {
  onboarding: { danger: [3, 4], complexity: [0, 1] },
  baseline: { danger: [4, 6], complexity: [1, 2] },
  transition: { danger: [6, 8], complexity: [2, 3] },
  skill: { danger: [8, 11], complexity: [3, 5] },
  mastery: { danger: [10, 13], complexity: [4, 6] },
};
```

Print the matching budget for each score.

- [ ] **Step 2: Add section budget constants in `game.js`**

Near `PATTERNS`, add:

```js
const SECTION_BUDGETS = {
  onboarding: { danger: [3, 4], complexity: [0, 1] },
  baseline: { danger: [4, 6], complexity: [1, 2] },
  transition: { danger: [6, 8], complexity: [2, 3] },
  skill: { danger: [8, 11], complexity: [3, 5] },
  mastery: { danger: [10, 13], complexity: [4, 6] },
};

const ROW_DANGER_COST = {
  grass: 0,
  road: 1,
  dense_slow_road: 2,
  fast_sparse_road: 2,
  rush_road: 3,
  train: 4,
  water: 1,
  short_log_river: 2,
  river_chain: 3,
};
```

- [ ] **Step 3: Replace `pickPattern()` with section-aware pattern selection**

Keep the existing `patternBuffer` behavior, but fill it from a section descriptor:

```js
function buildSection(score) {
  const stage = getDifficultyStage(score);
  const pool = stage === 'onboarding' ? PATTERNS.simple
    : stage === 'baseline' ? PATTERNS.simple
    : stage === 'transition' ? PATTERNS.medium
    : PATTERNS.hard;
  const rows = [...randFrom(pool)];
  const features = [];

  if ((stage === 'transition' || stage === 'skill' || stage === 'mastery') && Math.random() < 0.45) {
    features.push('survival_branch');
  }
  if (stage === 'mastery' && Math.random() < 0.35) {
    features.push('commitment_2_4');
  }

  const budget = SECTION_BUDGETS[stage];
  return { id: rowSectionId++, stage, rows, dangerBudget: budget.danger[1], complexityBudget: budget.complexity[1], features };
}
```

- [ ] **Step 4: Add route topology metadata to generated rows**

When `makeSmartRow(rowIdx)` returns a row, stamp:

```js
row.sectionId = activeSection ? activeSection.id : null;
row.sectionStage = activeSection ? activeSection.stage : getDifficultyStage(currentScore);
row.sectionFeatures = activeSection ? [...activeSection.features] : [];
```

- [ ] **Step 5: Enforce relief bounds**

In `fillBuffer()`, ensure:

```js
if (streakRoad + streakWater >= 5 && type !== 'grass') {
  type = 'grass';
}
```

Keep no more than two high-danger/high-complexity sections before a lower-danger reset.

- [ ] **Step 6: Coordinate trains with danger budget**

In `makeSmartRow()`, before creating a train, require:

```js
const trainAllowedByBudget = !activeSection || activeSection.dangerBudget >= 4;
const trainChance = currentScore >= 20 && trainAllowedByBudget ? 0.04 : 0;
```

When a train is used, mark:

```js
if (activeSection) activeSection.dangerBudget -= 4;
```

- [ ] **Step 7: Make siren reserve danger budget**

In `updateSirenEvent()`, filter road rows:

```js
const roadRows = rows.filter(r => r.type === 'road' && !r.sirenLocked && (!r.sectionDangerReserved || r.sectionDangerReserved <= 2));
```

If a row is chosen:

```js
sirenRow.sectionDangerReserved = (sirenRow.sectionDangerReserved || 0) + 3;
```

- [ ] **Step 8: Verify**

Run:

```bash
npm run difficulty:sim
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Update playtest gate notes**

Add to `docs/superpowers/playtests/difficulty-route-topology.md`:

```markdown
## Phase 2 Implementation Notes

- Danger and complexity budgets implemented:
- Trains reserve danger:
- Siren reserves danger:
- Relief floor implemented:
- Route topology metadata present:
```

- [ ] **Step 10: Commit**

```bash
git add public/game/game.js scripts/simulate-difficulty.mjs docs/superpowers/playtests/difficulty-route-topology.md
git commit -m "feat(game): add section danger and complexity budgets"
```

---

### Task 6: Phase 2B Playtest Gate

**Files:**
- Modify: `docs/superpowers/playtests/difficulty-route-topology.md`

**Interfaces:**
- Consumes: Task 5 route topology metadata.
- Produces: explicit pass/fail before economy tasks.

- [ ] **Step 1: Run simulator**

Run:

```bash
npm run difficulty:sim
```

Expected: outputs score bands and budgets for `150+`, `300+`, `650+`.

- [ ] **Step 2: Manual phone check**

Use the existing local server if the user has it running. If not running and the user asks, start it with:

```bash
npm run dev
```

Check phone viewport at scores:

```text
0, 100, 150, 300
```

- [ ] **Step 3: Record pass/fail**

Fill the Phase 2B section in `docs/superpowers/playtests/difficulty-route-topology.md` with:

```markdown
## Phase 2B Result

- Score `150+` sampled sections regularly expose at least 2 viable survival lines: PASS/FAIL
- Score `300+` playtest runs feel more planning-heavy than reaction-only: PASS/FAIL
- Score `300-800` does not feel flat after speed caps: PASS/FAIL
- Deaths remain explainable: PASS/FAIL
- Risk coin routes are not counted as the only meaningful branch: PASS/FAIL

Decision:
- Proceed to rating/economy:
- Tune topology first:
```

- [ ] **Step 4: Stop if gate fails**

If any item is `FAIL`, do not implement Tasks 7-12. Tune Task 5 until the gate passes.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/playtests/difficulty-route-topology.md
git commit -m "docs: record difficulty topology playtest gate"
```

---

### Task 7: Server Rating And XP Alignment

**Files:**
- Modify: `src/lib/economy/levels.ts`
- Modify: `src/app/api/score/submit/route.ts`
- Modify: `public/game/game.js`
- Modify: `src/components/Game.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getRunRating()`, `getRatingXpMultiplier()`.
- Produces API response fields:

```ts
rating: { id: RunRating; label: string }
xp.breakdown.rating: RunRating
xp.breakdown.multi: number
```

- [ ] **Step 1: Extend XP types**

In `src/lib/economy/levels.ts`, import rating helpers and extend:

```ts
import { getRatingDef, getRatingXpMultiplier, getRunRating, type RunRating } from './rating.ts';

export interface RunXpBreakdown {
  base: number;
  multi: number;
  streakBonus: number;
  recordBonus: number;
  rating: RunRating;
}
```

- [ ] **Step 2: Use rating multiplier**

In `calculateRunXp()`:

```ts
const rating = getRunRating(score);
const multi = getRatingXpMultiplier(rating);
const base = Math.round(baseXp * multi);
```

Return `rating` in breakdown.

- [ ] **Step 3: Return rating from score submit**

In `src/app/api/score/submit/route.ts`:

```ts
import { getRatingDef, getRunRating } from '@/lib/economy/rating.ts';
```

After score validation:

```ts
const rating = getRunRating(score);
const ratingDef = getRatingDef(rating);
```

In JSON response:

```ts
rating: { id: ratingDef.id, label: ratingDef.label },
```

- [ ] **Step 4: Align local fallback XP**

In `public/game/game.js`, replace local multiplier logic with browser config:

```js
function _getLocalRunRating(score) {
  const config = window.__BASE_RATING_CONFIG;
  const ratings = config && Array.isArray(config.ratings) ? config.ratings : [];
  let rating = ratings[0] || { id: 'casual', label: 'Casual', minScore: 0, xpMultiplier: 1, dailyQualityXp: 0 };
  for (const def of ratings) {
    if (score >= def.minScore) rating = def;
  }
  return rating;
}
```

Use `_getLocalRunRating(score).xpMultiplier` in `_calculateLocalRunXp()`.

- [ ] **Step 5: Add Game Over rating markup**

In `src/components/Game.tsx` Game Over screen, add above coins row:

```tsx
<div id="go-rating-row" className="go-rating-row" style={{display:'none'}}>
  <span id="go-rating-label" className="go-rating-label">Good Run</span>
</div>
```

- [ ] **Step 6: Render rating in `game.js`**

Change `UI.showGameOver(score, best, xpEarned, xpBreakdown)` to accept `rating`, then:

```js
const ratingRow = document.getElementById('go-rating-row');
const ratingLabel = document.getElementById('go-rating-label');
if (rating && ratingLabel && ratingRow) {
  ratingLabel.textContent = `${rating.label || rating.id} Run`;
  ratingRow.style.display = 'flex';
} else if (ratingRow) {
  ratingRow.style.display = 'none';
}
```

- [ ] **Step 7: Style rating badge**

In `src/app/globals.css`:

```css
.go-rating-row {
  display: flex;
  justify-content: center;
  margin: 0 0 8px;
}
.go-rating-label {
  border: 1px solid rgba(77,143,255,0.32);
  background: rgba(5,14,31,0.78);
  color: rgba(255,255,255,0.92);
  border-radius: 8px;
  padding: 6px 10px;
  letter-spacing: 1.5px;
  font-size: 0.82rem;
  font-weight: 800;
}
```

- [ ] **Step 8: Verify**

Run:

```bash
npm run rating:verify
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/economy/levels.ts src/app/api/score/submit/route.ts public/game/game.js src/components/Game.tsx src/app/globals.css
git commit -m "feat(economy): compute score-only run rating"
```

---

### Task 8: Daily Quality XP Bonus

**Files:**
- Modify: `src/lib/economy/storage.ts`
- Create: `src/lib/economy/daily-quality.ts`
- Modify: `src/app/api/score/submit/route.ts`
- Modify: `public/game/game.js`

**Interfaces:**
- Produces:

```ts
type DailyQualityState = {
  utcDate: string;
  bestRating: RunRating;
  claimedXp: number;
}
```

- Produces API response:

```ts
dailyQuality: { xpDelta: number; claimedXp: number; bestRating: RunRating }
```

- [ ] **Step 1: Add daily quality module**

Create `src/lib/economy/daily-quality.ts`:

```ts
import { getDailyQualityTargetXp, getRunRating, type RunRating } from './rating.ts';

export interface DailyQualityState {
  utcDate: string;
  bestRating: RunRating;
  claimedXp: number;
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function defaultDailyQualityState(date = utcDay()): DailyQualityState {
  return { utcDate: date, bestRating: 'casual', claimedXp: 0 };
}

export function normalizeDailyQualityState(input: unknown, date = utcDay()): DailyQualityState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaultDailyQualityState(date);
  const raw = input as Partial<DailyQualityState>;
  if (raw.utcDate !== date) return defaultDailyQualityState(date);
  return {
    utcDate: date,
    bestRating: getRunRating(ratingToMinScore(raw.bestRating)),
    claimedXp: Math.max(0, Math.floor(Number(raw.claimedXp) || 0)),
  };
}

export function applyDailyQualityRun(state: DailyQualityState, rating: RunRating): { state: DailyQualityState; xpDelta: number } {
  const targetXp = getDailyQualityTargetXp(rating);
  const xpDelta = Math.max(0, targetXp - state.claimedXp);
  const nextBest = targetXp >= getDailyQualityTargetXp(state.bestRating) ? rating : state.bestRating;
  return {
    xpDelta,
    state: { ...state, bestRating: nextBest, claimedXp: state.claimedXp + xpDelta },
  };
}

function ratingToMinScore(rating: unknown): number {
  if (rating === 'master') return 300;
  if (rating === 'elite') return 150;
  if (rating === 'great') return 80;
  if (rating === 'good') return 40;
  return 0;
}
```

- [ ] **Step 2: Add storage helpers**

In `src/lib/economy/storage.ts`, add memory map and helpers:

```ts
import { normalizeDailyQualityState, type DailyQualityState } from './daily-quality.ts';

const memDailyQuality = new Map<string, DailyQualityState>();

export async function readDailyQualityState(address: string): Promise<DailyQualityState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<DailyQualityState>>(`economy_daily_quality:${addr}`)
    : memDailyQuality.get(addr) ?? null;
  return normalizeDailyQualityState(data ?? {});
}

export async function writeDailyQualityState(address: string, state: DailyQualityState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeDailyQualityState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`economy_daily_quality:${addr}`, normalized);
  else memDailyQuality.set(addr, normalized);
}
```

- [ ] **Step 3: Apply daily quality in score submit**

In `src/app/api/score/submit/route.ts`, read/write state with quest/level state:

```ts
const dailyQualityState = await readDailyQualityState(addr);
const dailyQualityUpdate = applyDailyQualityRun(dailyQualityState, rating);
```

Include daily XP in level update:

```ts
const levelUpdate = updateLevelProgressFromRun(levelState, {
  score,
  sessionCoins,
  checkinStreak: checkinRewardState.streak,
  isNewRecord: score > previousBest,
  extraXp: dailyQualityUpdate.xpDelta,
});
```

Add `extraXp?: number` to `RunLevelProgress`, include it in the earned total,
and expose it in the breakdown:

```ts
export interface RunLevelProgress {
  score: number;
  sessionCoins?: number;
  checkinStreak?: number;
  isNewRecord?: boolean;
  extraXp?: number;
}

export interface RunXpBreakdown {
  base: number;
  multi: number;
  streakBonus: number;
  recordBonus: number;
  dailyQualityBonus: number;
  rating: RunRating;
}
```

In `calculateRunXp()`:

```ts
const dailyQualityBonus = Math.max(0, Math.floor(Number(run.extraXp) || 0));
return {
  earned: Math.max(0, base + streakBonus + recordBonus + dailyQualityBonus),
  breakdown: { base, multi, streakBonus, recordBonus, dailyQualityBonus, rating },
};
```

- [ ] **Step 4: Return daily quality result**

In score submit JSON:

```ts
dailyQuality: {
  xpDelta: dailyQualityUpdate.xpDelta,
  claimedXp: dailyQualityUpdate.state.claimedXp,
  bestRating: dailyQualityUpdate.state.bestRating,
},
```

- [ ] **Step 5: Show daily bonus on Game Over**

In `game.js`, if `xpBreakdown.dailyQualityBonus > 0`, add chip:

```js
if (xpBreakdown.dailyQualityBonus) bonuses.push(`${_uiIconHtml('celebration', 'go-xp-bonus-icon', 'daily')} daily +${xpBreakdown.dailyQualityBonus}`);
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/economy/daily-quality.ts src/lib/economy/storage.ts src/lib/economy/levels.ts src/app/api/score/submit/route.ts public/game/game.js
git commit -m "feat(economy): add daily quality xp bonus"
```

---

### Task 9: Server-Derived Elite Runs Quest

**Files:**
- Modify: `src/lib/economy/quests.ts`
- Modify: `public/game/game.js`
- Modify: `src/app/api/score/submit/route.ts`

**Interfaces:**
- Consumes: `RunRating`
- Produces quest id: `elite_runs`
- Produces `updateQuestProgressFromRun(state, { score, sessionCoins, rating })`

- [ ] **Step 1: Extend QuestId**

In `src/lib/economy/quests.ts`:

```ts
import type { RunRating } from './rating.ts';

export type QuestId = 'rows' | 'coins' | 'games' | 'record' | 'elite_runs';

export interface RunQuestProgress {
  score: number;
  sessionCoins?: number;
  rating?: RunRating;
}
```

- [ ] **Step 2: Add elite quest definition**

Append to `QUEST_DEFS`:

```ts
{
  id: 'elite_runs',
  levels: [
    { target: 1, reward: { coins: 40 } },
    { target: 3, reward: { boosters: 1 } },
    { target: 7, reward: { fragments: 3 } },
    { target: 15, reward: { coins: 80, boosters: 1 } },
    { target: 30, reward: { fragments: 6 } },
    { target: 50, reward: { container: 'rare_crate' } },
    { target: 80, reward: { fragments: 10, boosters: 2 } },
    { target: 120, reward: { container: 'epic_crate' } },
  ],
}
```

- [ ] **Step 3: Update default state**

In `defaultQuestState()`:

```ts
elite_runs: defaultEntry(),
```

- [ ] **Step 4: Increment only server-derived Great+ runs**

In `updateQuestProgressFromRun()`:

```ts
const eliteRunDelta = run.rating === 'great' || run.rating === 'elite' || run.rating === 'master' ? 1 : 0;
```

Return:

```ts
elite_runs: {
  ...normalized.elite_runs,
  progress: normalized.elite_runs.progress + eliteRunDelta,
},
```

- [ ] **Step 5: Pass rating from score submit**

In `src/app/api/score/submit/route.ts`:

```ts
const nextQuestState = updateQuestProgressFromRun(questState, { score, sessionCoins, rating });
```

- [ ] **Step 6: Mirror quest definition in local fallback**

In `public/game/game.js` `Quests.DEFS`, add `elite_runs` with the same targets/rewards and icon `/game/ui-icons/quests.png`.

Local fallback may update it from local score rating only when no address/server response exists. Server data remains authoritative when connected.

- [ ] **Step 7: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/economy/quests.ts src/app/api/score/submit/route.ts public/game/game.js
git commit -m "feat(economy): add elite runs quest"
```

---

### Task 10: Optional Risk Coin Routes

**Files:**
- Modify: `public/game/game.js`
- Modify: `scripts/simulate-difficulty.mjs`

**Interfaces:**
- Consumes: survival route topology from Task 5.
- Produces optional route features in section metadata:

```js
features: ['survival_branch', 'reward_route']
```

- [ ] **Step 1: Add risk route gating**

In section generation:

```js
function shouldAddRewardRoute(stage) {
  if (stage === 'transition') return Math.random() < 0.15;
  if (stage === 'skill') return Math.random() < 0.28;
  if (stage === 'mastery') return Math.random() < 0.35;
  return false;
}
```

- [ ] **Step 2: Add route coins only on grass/safe columns**

When generating grass row coins, if row has `reward_route`, add at most one extra coin in a side column:

```js
if (row.sectionFeatures && row.sectionFeatures.includes('reward_route') && coinsList.length < 2) {
  const sideCols = [1, 2, COLS - 3, COLS - 2].filter(col => !coinOccupied.has(col));
  if (sideCols.length) {
    const col = sideCols[Math.floor(rng(123) * sideCols.length)];
    coinOccupied.add(col);
    coinsList.push({ col, collected: false, riskRoute: true });
  }
}
```

- [ ] **Step 3: Keep rewards bounded**

Do not add more than:

```text
Transition: +1 coin per section
Skill: +2 coins per section
Mastery: +3 coins per section
```

- [ ] **Step 4: Simulate coin route density**

Extend `scripts/simulate-difficulty.mjs` output with estimated risk route chance per stage.

- [ ] **Step 5: Verify**

Run:

```bash
npm run difficulty:sim
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add public/game/game.js scripts/simulate-difficulty.mjs
git commit -m "feat(game): add bounded risk coin routes"
```

---

### Task 11: Economy Runway Check

**Files:**
- Create: `scripts/simulate-economy-runway.mjs`
- Modify: `package.json`
- Modify: `docs/superpowers/playtests/difficulty-route-topology.md`

**Interfaces:**
- Produces script command: `npm run economy:runway`
- Does not change rewards unless the simulation shows a runway gap.

- [ ] **Step 1: Create runway simulation**

Create `scripts/simulate-economy-runway.mjs`:

```js
const playerTypes = [
  { name: 'casual', runsPerDay: 4, avgScore: 55, avgCoins: 6, rating: 'good' },
  { name: 'active', runsPerDay: 10, avgScore: 110, avgCoins: 14, rating: 'great' },
  { name: 'skilled', runsPerDay: 15, avgScore: 240, avgCoins: 25, rating: 'elite' },
  { name: 'master', runsPerDay: 20, avgScore: 330, avgCoins: 34, rating: 'master' },
];

const multipliers = { good: 1.05, great: 1.12, elite: 1.2, master: 1.28 };
const dailyBonus = { good: 25, great: 50, elite: 100, master: 150 };

for (const player of playerTypes) {
  const baseRunXp = Math.round((player.avgScore + player.avgCoins * 2) * multipliers[player.rating]);
  const dailyXp = baseRunXp * player.runsPerDay + dailyBonus[player.rating];
  const daysToLevel35Approx = Math.ceil(59500 / dailyXp);
  console.log(JSON.stringify({ ...player, baseRunXp, dailyXp, daysToLevel35Approx }));
}
```

- [ ] **Step 2: Add script**

Modify `package.json`:

```json
"economy:runway": "node scripts/simulate-economy-runway.mjs"
```

- [ ] **Step 3: Run simulation**

Run:

```bash
npm run economy:runway
```

Expected: output contains casual/active/skilled/master and approximate days to level 35.

- [ ] **Step 4: Record result**

Append to playtest doc:

```markdown
## Economy Runway Simulation

- Casual:
- Active:
- Skilled:
- Master:
- Runway risk found:
- Follow-up reward changes needed:
```

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/simulate-economy-runway.mjs docs/superpowers/playtests/difficulty-route-topology.md
git commit -m "docs(economy): add mastery runway simulation"
```

---

### Task 12: Telemetry Event Names And Non-Blocking Tracking

**Files:**
- Modify: `src/lib/economy/telemetry.ts`
- Modify: `src/app/api/score/submit/route.ts`

**Interfaces:**
- Consumes: Next.js `after()` in route handlers.
- Produces new telemetry event names without blocking response.

- [ ] **Step 1: Extend event union**

In `src/lib/economy/telemetry.ts`:

```ts
| 'game_run_completed'
| 'game_difficulty_band_reached'
| 'economy_daily_quality_bonus_claimed'
| 'quest_elite_run_progressed'
```

- [ ] **Step 2: Track score submit result after response**

In `src/app/api/score/submit/route.ts`, import:

```ts
import { trackEconomyEventAfter } from '@/lib/economy/telemetry.ts';
```

Before return:

```ts
trackEconomyEventAfter('game_run_completed', addr, {
  score,
  sessionCoins,
  rating,
  xpEarned: levelUpdate.xpEarned,
  dailyQualityXp: dailyQualityUpdate?.xpDelta ?? 0,
});
```

- [ ] **Step 3: Track daily quality only when awarded**

```ts
if (dailyQualityUpdate.xpDelta > 0) {
  trackEconomyEventAfter('economy_daily_quality_bonus_claimed', addr, {
    rating,
    xpDelta: dailyQualityUpdate.xpDelta,
  });
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/telemetry.ts src/app/api/score/submit/route.ts
git commit -m "feat(economy): track run quality telemetry"
```

---

### Task 13: Final Verification And Phone Review

**Files:**
- Modify: `docs/superpowers/playtests/difficulty-route-topology.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces final implementation verification notes.

- [ ] **Step 1: Full command verification**

Run:

```bash
npm run rating:verify
npm run difficulty:sim
npm run economy:runway
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Manual user-facing checks**

Use phone viewport and verify:

```text
Menu still loads
Loadout still starts run
HUD remains compact
Score 0-100 remains readable
Score 150+ has visible route choices
Game Over shows rating, coins, XP, bonuses
Quests still render
Shop/profile/loadout sync still works
On-chain check-in UI still opens and claims through existing path
Daily spin still opens and uses existing path
NFT claim buttons still appear only for eligible rewards
```

- [ ] **Step 3: Record verification**

Append:

```markdown
## Final Verification

- `npm run rating:verify`:
- `npm run difficulty:sim`:
- `npm run economy:runway`:
- `npm run lint`:
- `npm run build`:
- Phone viewport result:
- On-chain flows touched: no
- Known follow-ups:
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/playtests/difficulty-route-topology.md
git commit -m "docs: record difficulty economy verification"
```

---

## Execution Notes

- Implement Tasks 1-6 first. Stop at Task 6 if Phase 2B fails.
- Implement Tasks 7-12 only after route topology feels better in actual play.
- Keep every task in its own commit.
- Do not use manipulated `sessionCoins` for rating.
- Do not trust client-authored row counts for economy-bearing quests.
- Prefer tuning route topology over adding rewards if gameplay still feels like pure reaction.
- If `game.js` becomes too risky to edit directly, split pure constants into generated files first, but do not restructure the renderer/game loop as part of this feature.

## Self-Review

- Spec coverage: prerequisites, fairness foundation, speed caps, death summary, section danger/complexity budgets, route topology gate, rating/XP, daily quality, elite quest, risk routes, runway check, telemetry, and acceptance verification are covered.
- Placeholder scan: no `TBD`, `TODO`, or deferred unknowns in the plan.
- Type consistency: `RunRating`, `rating`, `dailyQuality`, `elite_runs`, `dangerBudget`, and `complexityBudget` names are used consistently across tasks.
