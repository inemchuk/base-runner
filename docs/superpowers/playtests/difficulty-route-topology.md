# Difficulty Route Topology Playtest

Date: 2026-07-05
Branch: codex/economy-v1-local-focus

## Baseline Before Implementation

- Economy V1 prerequisite checked: `src/app/api/score/submit/route.ts` wires `updateQuestProgressFromRun`, `updateLevelProgressFromRun`, `writeQuestState`, and `writeLevelState`; `src/app/api/quests/route.ts` returns `ignored: true` from `POST`.
- `/api/quests POST` cannot overwrite quest progress: it reads stored quest state only and marks the sync response as ignored.
- `/api/score/submit` updates quests and levels: it loads stored quest and level state, applies run progress, and persists both states together.
- Current best known issues: no blocking prerequisite issues found in the checked routes; deeper phase 2B balance data still needs manual playtest sampling.

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
