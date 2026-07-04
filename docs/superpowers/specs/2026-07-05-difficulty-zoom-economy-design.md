# Difficulty, Zoom, And Economy Stack Design

Date: 2026-07-05
Status: draft for user review
Scope:
- `public/game/game.js` gameplay difficulty, camera feel, run summary UI.
- `src/lib/economy/levels.ts` XP calculation.
- `src/lib/economy/quests.ts` future quest expansion.
- `src/app/api/score/submit/route.ts` accepted run summary and server progression.

## Goal

Create one coherent progression system where harder gameplay, camera zoom,
loadout choices, XP, quests, and economy all support each other.

The player should feel:

- early runs are readable and approachable;
- mid runs become more strategic as the camera pulls back;
- high-score runs are hard because there are more route choices, not only
  because everything becomes faster;
- better runs naturally produce more XP, quest progress, and coins;
- Focus fragments still come from controlled reward gates such as check-in,
  spin, quests, levels, and crates, not from unlimited raw gameplay farming.

## Non-Goals

- Do not give Focus fragments directly for every hard lane.
- Do not make raw car speed scale forever.
- Do not bypass the existing fragment-first cosmetic economy.
- Do not change on-chain check-in, paymaster, spin contract config, or NFT mint
  flows as part of this feature.
- Do not add token mechanics here.

## Current Context

### Difficulty

The world currently uses score-based difficulty in `public/game/game.js`.

- `smoothProgress(score, 0, 250)` drives speed, density, and gaps.
- Cars ramp from about `60-75 px/s` early to about `100-125 px/s` before row
  modifiers.
- Lane personalities add variety:
  - `sparse`: fewer cars, larger gaps.
  - `dense`: more cars, smaller gaps.
  - `rush`: more cars and `carSpeedBase * 1.6`.
- Pattern pools switch by score:
  - `< 50`: simple.
  - `50-149`: medium.
  - `150+`: hard.
- Trains appear after score `20`, currently low chance and at least 25 rows
  apart.

### Zoom

The camera already has the right high-level design:

- `1.25x` close-up below score `100`.
- Smooth pullback between score `100` and `300`.
- `1.0x` by score `300`, showing the full 9-column field on phone width.

This zoom is a gameplay contract. Difficulty tuning must respect it:

- before `100`, do not require wide-field planning;
- after `150`, route choice can become more important;
- after `300`, difficulty should grow mostly through pattern composition and
  risk/reward choices, not more speed.

### Economy

Economy V1 is already designed around Focus fragments and controlled reward
sources.

- Check-in weekly value: `190 coins`, `10 Focus fragments`, `5 boosters`,
  `75 XP`.
- Spin EV: about `0.88` fragments/day before crates, about `1.18` with crate EV.
- Quests and levels grant mixed rewards: coins, boosters, fragments, and crates.
- Legendary cosmetics are fragment-only by default.
- Server-side score submit already updates quests and XP from accepted runs.

Current XP formula:

```ts
baseXp = score + sessionCoins * 2
multi = score >= 150 ? 1.2 : score >= 75 ? 1.1 : 1.0
streakBonus = min(checkinStreak * 2, 20)
recordBonus = isNewRecord ? round(base * 0.5) : 0
```

This is a good base. The new system should extend it carefully instead of
replacing it wholesale.

## Core Principle

Difficulty should create better runs.

Better runs should create:

- more session coins through risk routes;
- more XP through score, coins, run rating, streak, and records;
- more quest progress through controlled quest gates;
- more long-term economy progress through quest and level rewards.

Better runs should not directly mint unlimited fragments.

The intended stack:

```text
Zoom opens vision
→ difficulty adds route choice
→ route choice creates better runs
→ better runs earn coins, XP, and quest progress
→ quests/levels/check-in/spin grant fragments, crates, boosters, and cosmetics
```

## Difficulty Stages

Use score bands that align with the camera curve and existing progression.

| Stage | Score | Camera | Gameplay Role |
| --- | ---: | --- | --- |
| Onboarding | 0-39 | close `1.25x` | Teach lanes, avoid speed spikes |
| Baseline | 40-99 | close `1.25x` | Add light density and first trains |
| Transition | 100-149 | pulling back | Start route planning, still fair speeds |
| Skill Mode | 150-299 | wider every run | Hard patterns, risk routes, more choices |
| Mastery | 300+ | full field | Pattern mastery, capped speed, prestige |

### Onboarding: 0-39

Purpose: make first runs readable.

Rules:

- No `rush` rows before score `40`.
- Trains can remain technically possible after score `20`, but should be rare
  and budgeted.
- Water rows should always have a visible, useful path near the center.
- Avoid more than 2 dangerous rows before a relief row.

### Baseline: 40-99

Purpose: let the player feel improvement without needing full-field vision.

Rules:

- Introduce `dense` rows gradually.
- Keep `rush` rare and not adjacent to trains.
- Coin placement stays mostly safe and central.
- Shield is valuable for score, but not required.

### Transition: 100-149

Purpose: camera starts widening, so route choice can begin.

Rules:

- Add early risk/reward coin routes.
- Allow simple lane combos, but do not stack `rush + train + water chain`.
- Water can use shorter logs, but must keep a readable landing option.
- Player should start noticing multiple viable paths.

### Skill Mode: 150-299

Purpose: this is the main arcade skill band.

Rules:

- Hard pattern pool is allowed.
- Risk coin routes become meaningful.
- Trains can appear as part of a section budget.
- `rush` is allowed, but speed and siren spikes must be capped.
- Consecutive water rows can appear, but need fairness guarantees.

### Mastery: 300+

Purpose: high-score play should be deep, not unreadable.

Rules:

- Do not keep increasing raw speeds after the intended cap.
- Increase variety through lane archetypes and section composition.
- Use prestige quests and run rating rather than extra fragment farming.
- Keep deaths readable: the player should understand what mistake happened.

## Difficulty Budget

Replace independent row randomness with a section-level danger budget.

A section is 4-6 rows plus a relief opportunity. The generator spends a budget
on row archetypes. Higher score gives a bigger budget, but every section remains
bounded.

Suggested row costs:

| Archetype | Cost | Notes |
| --- | ---: | --- |
| Grass / relief | 0 | Safe reset, may contain basic coins |
| Calm road | 1 | Few cars, readable gaps |
| Dense road | 2 | More cars, normal speed |
| Fast sparse road | 2 | Faster, fewer cars |
| Rush road | 3 | Fast, capped, never stacked casually |
| Train row | 4 | Requires warning and spacing |
| Stable river | 1 | Long logs, readable center |
| Short-log river | 2 | Shorter logs, fair coverage |
| River chain row | 3 | Used in 2-3 water sequences |
| Risk coin route | +1 | Adds coins to a harder path |

Suggested section budgets:

| Stage | Budget |
| --- | ---: |
| Onboarding | 3-4 |
| Baseline | 4-6 |
| Transition | 6-8 |
| Skill Mode | 8-11 |
| Mastery | 10-13 |

Budget rules:

- No train in a section that already has a `rush` row unless score is `150+`
  and the section includes a relief row.
- No more than 2 water rows in a row before score `120`.
- 3 water rows in a row are allowed after score `150`, but at least one must be
  a stable river with a long log.
- After any section with cost `10+`, force a lower-cost section or clear relief
  row soon after.

## Lane Archetypes

Use named lane archetypes instead of tuning only raw speed/count.

### Road Archetypes

`calm_road`
- Low-mid speed.
- 2-3 cars.
- Larger spacing.
- Used early and as relief.

`dense_slow_road`
- More cars.
- Normal speed.
- Good for route planning without reaction spikes.

`fast_sparse_road`
- Fewer cars.
- Higher speed.
- Teaches timing.

`rush_road`
- Fast row.
- Capped multiplier, recommended `1.35-1.45` instead of `1.6`.
- No direct adjacency to train in early/mid game.

`siren_event`
- Treat as a section-level event, not just a timer surprise.
- Cap siren car speed so it does not exceed readable train-like speed.
- Recommended cap: about `320-340 px/s`, below or near train readability.

### Water Archetypes

`stable_river`
- 3-4 cell logs appear often.
- Useful center coverage.
- Good after hard roads.

`short_log_river`
- More 2-cell logs.
- Still guarantees center readability.

`flow_river`
- Slightly faster logs.
- Better with zoomed-out play.

`river_chain`
- 2-3 consecutive water rows.
- Must have at least one stable row and avoid same-direction runaway without an
  escape option.

### Train Archetype

`train_warning`
- High danger, high readability.
- Must count heavily against section budget.
- Keep the warning clear and early enough for mobile reaction.

## Water Fairness

Current code builds at least 5 logs and fills the world width, so the issue is
not simply "too few logs". The fairness risk is phase and visible coverage:
the player may reach a water row when useful logs are off-center or off-screen.

Add water fairness guarantees:

- At row creation, active logs should cover at least one of the central columns
  within the first readable moment.
- Visible lane coverage should not fall below a minimum target.
  - Early: 55-65%.
  - Mid: 45-55%.
  - Late: 38-50%, but with readable timing.
- A water row immediately after a hard road should prefer `stable_river`.
- In a 2-3 row river chain, at least one row must include a long log.
- If logs move the same direction across multiple water rows, avoid speeds that
  push the player off-screen without a reasonable lateral escape.

## Speed Caps

Raw speed should support difficulty but not become the only difficulty.

Recommendations:

- Keep smooth base speed ramp, but stop major speed growth around score
  `250-300`.
- Reduce `rush` multiplier from `1.6` to `1.35-1.45`, or cap final row speed.
- Cap siren speed around `320-340 px/s`.
- Trains can remain faster because they are explicit warning events.
- After score `300`, add pattern variety and risk routes instead of more speed.

## Risk Routes And Coins

Risk routes are the bridge between gameplay difficulty and economy.

They should:

- appear mostly after score `100`;
- become meaningful after score `150`;
- be optional, not required for survival;
- reward better routing with extra session coins;
- stack naturally with magnet and double coins;
- stay within server coin plausibility caps.

Suggested design:

- Normal coin pacing remains roughly one coin per 15-20 rows before boosters.
- Transition stage can add small optional coin lines worth `+1-2 coins`.
- Skill stage can add risk clusters worth `+2-5 coins` if routed well.
- Mastery stage can add longer routes, but not unlimited coin farming.

Booster interaction:

- Magnet makes side/risk coins easier without forcing dangerous movement.
- Double coins amplifies a good route, but costs a booster charge.
- Shield lets the player choose a risky timing or recover from one mistake,
  mostly improving score/quests rather than guaranteeing profit.

## Run Rating

Add a server-compatible run rating. The first version should use values the
server already accepts or can verify cheaply:

- score;
- sanitized session coins;
- new record;
- check-in streak;
- eventually daily best run state.

Do not depend on client-authored "I passed hard lanes" for rewards in V1.

Suggested ratings:

| Rating | Baseline Trigger |
| --- | --- |
| Casual | score below 40 |
| Good | score 40+ |
| Great | score 80+ |
| Elite | score 150+ |
| Master | score 300+ |

Optional coin-aware upgrades:

- A score `60+` run with unusually strong session coins can count as `Great`.
- A score `120+` run with a new record can count as `Elite`.

The rating should appear on game over as a concise result badge, not as a
tutorial explanation.

## XP Design

Keep the current XP base:

```ts
baseXp = score + sessionCoins * 2
```

Then make the multiplier align with run rating and zoom stages.

Suggested multipliers:

| Rating | Score Band | Multiplier |
| --- | ---: | ---: |
| Casual | 0-39 | 1.00 |
| Good | 40-79 | 1.05 |
| Great | 80-149 | 1.12 |
| Elite | 150-299 | 1.20 |
| Master | 300+ | 1.28 |

Keep:

- check-in streak bonus, capped at `20 XP`;
- new record bonus, around `50%` of multiplied base.

Add a daily quality bonus later:

| Best Rating Today | XP Bonus |
| --- | ---: |
| Good | +25 |
| Great | +50 |
| Elite | +100 |
| Master | +150 |

Daily quality bonus should be upgrade-based:

- If the player earns Good first, grant `+25`.
- If later the same day they earn Great, grant only the difference `+25`.
- If later they earn Elite, grant only the difference to `+100`.

This makes the first meaningful run of the day valuable without making repeated
farming explode XP.

## Quest Design

The current quest system has:

- rows;
- coins;
- games;
- record.

Keep those. Add gameplay mastery quests later, after run rating is stable.

Recommended future quest IDs:

`roads`
- Progress: accepted road rows crossed.
- Reward identity: coins and booster packs.
- Requires server-verifiable row stats before becoming authoritative.

`rivers`
- Progress: accepted water rows crossed.
- Reward identity: trail progress and Focus fragments.
- Requires server-verifiable row stats.

`trains`
- Progress: train rows survived.
- Reward identity: crates and prestige progress.
- Requires server-verifiable row stats or daily seeded generation.

`elite_runs`
- Progress: count accepted Great/Elite/Master runs.
- Reward identity: crates, large Focus progress, boosters.
- Can be implemented earlier because it derives from score.

`booster_strategy`
- Progress: achieve target score with a selected booster or without boosters.
- Reward identity: booster packs and XP.
- Requires server-accepted loadout usage or conservative client/local fallback.

First recommended addition:

- `elite_runs`, because it can be server-derived from accepted score and does
  not require trusting row-by-row client stats.

## Economy Interaction

Difficulty should not directly pay fragments.

Allowed economy links:

- harder runs produce higher score;
- better routes produce more session coins;
- score and coins produce XP;
- score and coins advance quests;
- quests and levels grant fragments/crates/boosters;
- daily quality bonus grants XP only;
- future paid run modifiers may grant special opportunities.

Future run modifiers:

`Coin Rush`
- Coin density increases for one run.
- Costs coins.
- Does not directly affect fragments.

`XP Run`
- Adds a modest XP multiplier for one run.
- Costs coins or comes from events.

`Fragment Hunt`
- One-run objective: reach a score target to earn 1 Focus fragment.
- Should be paid/limited and server-authoritative before deployment.
- Not part of the first difficulty implementation.

## UI And Feedback

### During Run

Keep HUD minimal.

Possible subtle feedback:

- small rating progress pulse at score thresholds;
- coin route sparkle or lane cue;
- clear train warning;
- booster effect feedback already present.

Avoid long instructional text. The game should teach through layout and
feedback.

### Game Over

Game over should explain the reward stack clearly:

```text
Elite Run
+42 coins
+188 XP
Record bonus +64
Daily Elite bonus +50
Quest: Elite Runs 2/5
Focus: Fire Trail 13/20
```

Only show rows that actually changed.

### Profile / Quests

Profile should show:

- level;
- XP progress;
- best rating today or current daily quality bonus state;
- next meaningful level reward.

Quests should show:

- existing rows/coins/games/record quests;
- later, mastery quests grouped as gameplay achievements.

## Server Authority And Anti-Abuse

V1 server-trusted inputs:

- score, after score submit validation;
- session coins, sanitized by score-based cap;
- previous best / new record;
- check-in streak from server reward state.

Do not trust client-authored row archetype counts for economy rewards until
there is a server-verifiable generation path.

Implementation implications:

- Run rating can be server-side immediately.
- Daily quality XP bonus can be server-side immediately.
- `elite_runs` quest can be server-side immediately.
- `roads`, `rivers`, and `trains` quests should wait for a verified row summary
  design or daily seeded generation.

Current score submit already has a speed plausibility check. Keep this path as
the main entry for XP and quest progress.

## Telemetry

Add telemetry before heavy tuning.

Recommended events:

- `game_run_completed`: score, sessionCoins, rating, deathCause, boostersUsed.
- `game_difficulty_band_reached`: highest stage reached.
- `game_zoom_band_reached`: 100, 150, 300 thresholds.
- `game_water_death`: score, row index, visible log coverage if measurable.
- `game_train_death`: score, warning time if measurable.
- `game_risk_route_collected`: route id or generated section id, coins gained.
- `economy_daily_quality_bonus_claimed`: rating, xpDelta.
- `quest_elite_run_progressed`: rating, before, after.

Metrics to review:

- death distribution by score band;
- water deaths immediately after entering water;
- average session coins by score band;
- XP/day by player type;
- percentage of runs reaching 40/80/150/300;
- booster use rate by rating;
- quest completion pacing.

## Balance Targets

Casual active player:

- 3-6 runs/day.
- Usually reaches Good sometimes, Great occasionally.
- Meaningful XP progress every day.
- Does not need risk routes to progress.

Good active player:

- 8-15 runs/day.
- Reaches Great often, Elite sometimes.
- Benefits from loadout and risk routes.
- Earns quest rewards faster, but does not bypass fragments.

High-skill player:

- Reaches Elite/Master.
- Gains more XP and quest progress.
- Earns more coins through risk routes.
- Still uses controlled reward gates for fragments and legendary progress.

## Implementation Phases

### Phase 1: Fairness And Difficulty Foundation

- Add a read-only balance simulator for row generation at score bands.
- Report car speeds, row archetypes, water visible coverage, and section danger.
- Add water fairness guarantees.
- Cap `rush` and siren speed spikes.
- Keep camera zoom curve unchanged.

### Phase 2: Section Budget And Archetypes

- Introduce explicit lane archetypes.
- Generate sections with danger budget.
- Keep existing pattern feel, but make spikes intentional and bounded.
- Add relief rules after high-danger sections.

### Phase 3: Run Rating And XP

- Add shared server/client run rating calculation.
- Update XP multiplier to rating bands.
- Add game over rating presentation.
- Keep local fallback aligned with server formula.

### Phase 4: Daily Quality Bonus

- Store best rating claimed per UTC day.
- Award upgrade-based daily XP bonus.
- Show bonus only on game over when it changes.
- Do not award coins or fragments from this bonus.

### Phase 5: Elite Runs Quest

- Add server-derived `elite_runs` quest.
- Rewards should follow Economy V1 pattern:
  - early coins/boosters;
  - mid Focus fragments;
  - later rare/epic crate;
  - no direct legendary unlock.

### Phase 6: Risk Coin Routes

- Add optional coin routes after score `100`.
- Add stronger risk routes after score `150`.
- Tune session coin income against existing coin budget.
- Verify double coins and magnet do not overinflate daily economy.

### Phase 7: Advanced Mastery Quests

- Add roads/rivers/trains quests only after row stats can be trusted or safely
  bounded.
- Prefer daily seeded generation or server-verified summaries before making
  these economy-bearing.

## Open Decisions

1. Exact `rush` multiplier:
   - Recommendation: start at `1.4`, then tune from deaths and screenshots.

2. Siren cap:
   - Recommendation: `330 px/s`, because it is close to train readability while
     avoiding extreme high-score rush spikes.

3. Daily quality bonus:
   - Recommendation: XP only, upgrade-based per UTC day.

4. First mastery quest:
   - Recommendation: `elite_runs`, because it is server-derived from score.

5. Risk coin route density:
   - Recommendation: add only after fairness/caps land, then tune from
     session coin telemetry.

## Acceptance Criteria

- At score `<100`, the game remains readable in close camera.
- At score `150+`, the player gets more route choices, not just faster deaths.
- At score `300+`, difficulty feels like mastery and planning, not unfair speed.
- Water deaths are explainable and not caused by empty/unreadable first landing.
- Raw speed spikes are capped.
- XP/day increases for better play but does not explode for grinders.
- Focus fragments remain controlled through check-in, spin, quests, levels, and
  crates.
- Existing on-chain check-in, paymaster, spin, and NFT mint flows are untouched.
