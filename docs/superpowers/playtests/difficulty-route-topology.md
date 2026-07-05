# Difficulty Route Topology Playtest

Date: 2026-07-05
Branch: codex/economy-v1-local-focus

## Baseline Before Implementation

- Economy V1 prerequisite checked: `src/app/api/score/submit/route.ts` wires `updateQuestProgressFromRun`, `updateLevelProgressFromRun`, `writeQuestState`, and `writeLevelState`; `src/app/api/quests/route.ts` returns `ignored: true` from `POST`.
- `/api/quests POST` cannot overwrite quest progress: it reads stored quest state only and marks the sync response as ignored.
- `/api/score/submit` updates quests and levels: it loads stored quest and level state, applies run progress, and persists both states together.
- Current best known issues: route-level prerequisites are green. Task 1A fixed
  baseline lint errors; `npm run lint` now exits `0` with warnings only.
  `npm run build` exits `0` when run outside the sandbox; inside the sandbox,
  Turbopack still fails on port binding with `Operation not permitted
  (os error 1)`. Deeper phase 2B balance data still needs manual playtest
  sampling.

## Phase 2B Gate

- Score `150+` sampled sections regularly expose at least 2 viable survival lines:
- Score `300+` runs feel planning-heavy rather than reaction-only:
- Score `300-800` does not feel flat after speed caps:
- Deaths remain explainable:
- Risk coin routes are not counted as the only meaningful branch:

## Phase 2 Implementation Notes

- Danger and complexity budgets implemented: partially — `SECTION_BUDGETS` per
  stage in `game.js`; every generated row deducts its `ROW_DANGER_COST` from
  the section's `dangerBudget`, and the train gate reads it. `complexityBudget`
  is carried but not yet consumed (reserved for Task 10 route features).
- Trains reserve danger: yes — a train requires `dangerBudget >=
  ROW_DANGER_COST.train` (4) remaining in the active section, is blocked in
  relief sections, and its cost is deducted like any other row. Note: with the
  25-row `lastTrainRow` spacing the budget gate binds mostly in
  onboarding/baseline sections (budget 4-6), rarely in skill/mastery.
- Siren reserves danger: row-level dedup, not section accounting — a siren adds
  `sectionDangerReserved += 3` to its road row; rows with reservation > 2 are
  excluded from future siren picks. Behavior change vs before: each road row
  hosts at most one siren per run (previously an idle player got repeat sirens
  on the same rows).
- Relief floor implemented: as a future-guard — a dedicated `streakDanger`
  counter (road+water, not reset by type switch) forces grass after 5
  consecutive dangerous rows. Current patterns end in grass and max out at 4
  consecutive dangerous rows, so the floor only binds if longer/mixed patterns
  are added later. The *active* relief mechanism is the section cadence: at
  most two consecutive hard sections, then a medium relief section (no
  features, no trains).
- Route topology metadata present: yes — every row (including init grass rows)
  is stamped with `sectionId`, `sectionStage`, `sectionFeatures`
  (`survival_branch` at 45% for transition+, `commitment_2_4` at 35% for
  mastery, `relief` when forced; relief sections roll no other features).
- Speed caps from Task 3 (rush max 170->150, siren max ~425->300 px/s) are real
  gameplay softening — must be felt-checked in the Phase 2B playtest below.
- Pool mapping change to felt-check: scores 50-100 now get simple patterns
  (previously medium) — check that 50-100 does not feel flat.
- Cadence to felt-check: hard/hard/relief softens sustained mastery pressure —
  check that 300+ still feels demanding.

## Manual Phone Checks

- Viewport:
- Score band:
- Notes:
