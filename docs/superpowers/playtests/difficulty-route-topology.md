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

- Danger and complexity budgets implemented: yes — `SECTION_BUDGETS` per stage
  (onboarding..mastery) in `game.js`; sections carry `dangerBudget` and
  `complexityBudget` as separate axes.
- Trains reserve danger: yes — a train requires `dangerBudget >= 4` in the
  active section and deducts `ROW_DANGER_COST.train` (4) when spawned.
- Siren reserves danger: yes — a siren adds `sectionDangerReserved += 3` to its
  road row and rows with reservation > 2 are excluded from future siren picks.
- Relief floor implemented: yes — after 5 consecutive road/water rows the next
  row is forced to grass; additionally at most two consecutive hard sections
  before a medium relief section.
- Route topology metadata present: yes — every generated row is stamped with
  `sectionId`, `sectionStage`, `sectionFeatures` (`survival_branch` at 45% for
  transition+, `commitment_2_4` at 35% for mastery, `relief` when forced).
- Speed caps from Task 3 (rush max 170->150, siren max ~425->300 px/s) are real
  gameplay softening — must be felt-checked in the Phase 2B playtest below.

## Manual Phone Checks

- Viewport:
- Score band:
- Notes:
