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

> Status 2026-07-05: user **waived** the manual phone playtest gate and
> authorized proceeding to the economy tasks on the strength of the simulator
> output (speeds capped, budgets scale cleanly per stage). The felt-checks below
> remain open and should be sampled in a later real play session; the balance
> changes flagged (50-100 easing, hard/hard/relief cadence, rush/siren softening)
> are not yet human-verified.


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

## Economy Runway Simulation

`npm run economy:runway` (approx days to reach level 35 / top reward tier):

- Casual (4 runs/day, ~55 score, Good): baseRunXp 70, dailyXp 305, ~196 days.
- Active (10 runs/day, ~110 score, Great): baseRunXp 155, dailyXp 1600, ~38 days.
- Skilled (15 runs/day, ~240 score, Elite): baseRunXp 348, dailyXp 5320, ~12 days.
- Master (20 runs/day, ~330 score, Master): baseRunXp 509, dailyXp 10330, ~6 days.
- Runway risk found: none blocking. The 196-day casual runway is long but
  acceptable — level 35 is the aspirational top tier (legendary bundle); casual
  players are expected to plateau at mid levels. The daily-quality bonus adds a
  meaningful floor for low-volume players without collapsing the skilled/master
  spread. No reward-inflation risk (master's 6 days reflects rare, high-skill
  volume, not a farmable exploit — elite_runs and rating are score-gated).
- Follow-up reward changes needed: none now. Monitor casual retention; if the
  mid-game (levels 10-20) feels slow for casual players, revisit the daily
  quality XP values rather than the base multiplier.

## Manual Phone Checks

- Viewport:
- Score band:
- Notes:

## Final Verification

Run 2026-07-06 (all automated commands green):

- `npm run rating:verify`: PASS — "rating config verified".
- `npm run difficulty:sim`: PASS — all bands 0..650 print speeds, danger/complexity
  budgets, and reward-route chance/cap; rush ≤150, siren ≤300.
- `npm run economy:runway`: PASS — casual ~196d / active ~38d / skilled ~12d /
  master ~6d to level 35.
- `npm run lint`: exit 0 (97 warnings, 0 errors — baseline).
- `npm run build`: exit 0 (prebuild rating drift check runs and passes).
- `tsc --noEmit`: exit 0.
- Pre-existing economy suite: `verify-economy-{server-authority,telemetry,
  reward-claims,v1-local}.mjs` exit 0; `test-economy-core.mjs` passes with
  `node --experimental-strip-types` (it imports .ts directly; the plain-node
  failure is pre-existing and loader-related, not a regression from this work).
- On-chain flows touched: no (check-in, paymaster, spin config, NFT mint
  untouched).
- Phone viewport result: NOT performed — the Phase 2B manual playtest gate was
  waived by the user; the felt-checks above (50-100 easing, hard/hard/relief
  cadence, rush/siren softening, route readability at 150+) remain open for a
  future real play session.
- Known follow-ups: felt-checks above; skill/mastery reward-route caps are
  future-guards (single-grass-row sections add ~1 coin); local elite_runs only
  advances offline by design; game_difficulty_band_reached telemetry name is
  reserved for a future client emitter.
