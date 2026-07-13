# Run Complete Loadout Design

## Goal

Replace the current dead-end Game Over overlay with a single **Run Complete**
screen that both summarizes the finished run and prepares the next one.

After a death, the player must be able to review the result, claim the score
onchain when eligible, adjust the same skin, trail, and booster choices offered
by Loadout, and start the next run without visiting a separate Loadout screen.
The separate Loadout screen remains the entry point when Play is selected from
the main menu.

The screen must be idempotent per run: delayed timers, duplicate death events,
score reconciliation, quest updates, level-up handling, and onchain claim events
must never reopen it or overwrite a newer run.

## Current-state findings

- `screen-gameover` is a loose vertical stack of result text and buttons over a
  mostly opaque overlay. It hides the final game scene and is visually weaker
  than the existing Loadout and Runner Hub screens.
- The visible action says `PLAY AGAIN`, but it opens Loadout rather than starting
  another run.
- The local result is scheduled after 600 ms while an authoritative score
  response can also call `UI.showGameOver`. A fast response followed by the
  delayed local callback can reopen the screen, replace authoritative values,
  and reset the onchain button.
- The result stack has no dedicated scroll or safe-area treatment and can clip
  when rating, rewards, quest, onchain claim, and navigation actions are all
  visible.

## Product decisions

- The player-facing title becomes `RUN COMPLETE`; the internal
  `screen-gameover` identifier may remain to minimize unrelated churn.
- The result uses `STEPS`, matching the in-run HUD, rather than switching back
  to `SCORE` in the presentation copy.
- After a finished run, Run Complete replaces the separate Loadout step.
- Play from the main menu continues to open the standalone Loadout screen.
- `START NEXT RUN` launches gameplay directly with the choices currently shown
  on Run Complete.
- `CLAIM ONCHAIN` remains a visible conditional action inside the result card.
- `MENU` remains the secondary exit.
- The redundant `Run build` summary is omitted from Run Complete because the
  selected gear and boosters are already visible.
- Economy values, eligibility rules, score authority, booster consumption,
  quest rules, level rewards, and onchain contract behavior do not change.

## Screen composition

The frozen final gameplay frame remains behind the interface. A consistent
navy veil lowers its contrast while preserving the location and cause of death.
The screen uses the existing compact Loadout visual grammar.

From top to bottom:

1. **Header**
   - `RUN COMPLETE` on the left.
   - Current total coin balance on the right, using the same balance treatment
     as Loadout.
2. **Result card**
   - Large run value with the label `STEPS`.
   - Record value or a prominent `NEW RECORD` state.
   - Existing non-casual run rating when applicable.
   - Earned coin and XP chips.
   - Existing XP bonus breakdown where present.
   - A compact claimable-quest row where present.
   - Conditional `CLAIM ONCHAIN` action and its transaction state.
3. **Gear row**
   - Skin and trail cards, including the existing previous/next controls,
     equipped preview, name, and owned count.
4. **Boosters for next run**
   - Coin Magnet, Double Coins, and Second Chance use the same selectable state,
     inventory counts, and availability rules as standalone Loadout.
5. **Sticky actions**
   - Filled primary action: `START NEXT RUN`.
   - Muted secondary action: `MENU`.

The content region scrolls when needed. The sticky action area accounts for its
own height with bottom padding so it never hides the last booster row. Safe-area
insets are respected on both the scroll region and action area.

## Visual direction

- Preserve the current monospace arcade type system and uppercase utility copy.
- Reuse the existing Void, Deep lane, Base blue, Signal blue, reward gold, XP
  violet, success mint, and danger red tokens.
- The result card and Loadout cards use Deep lane surfaces, restrained blue
  borders, and the existing low-cost inset highlight.
- The large step value is the primary visual anchor.
- `NEW RECORD` uses reward gold; completed quests use success mint; XP remains
  violet; rating colors keep their existing tier semantics.
- `START NEXT RUN` uses the existing filled Base-blue primary treatment.
- `CLAIM ONCHAIN` spans the usable width of the result card as an outlined
  Base-blue action. It is clearly visible but does not compete with the primary
  run action.
- The current red restart treatment is removed because the next-run action is
  progression, not danger.
- No new typeface, expensive continuous blur, or ambient DOM animation is
  introduced.

## Entrance and motion

1. The existing cause-specific death impact completes.
2. The navy veil fades in over 180 ms.
3. The result card enters with one short upward transition.
4. The step value performs one restrained scale emphasis.
5. The Loadout content and primary action appear together without a long
   staggered sequence.

`prefers-reduced-motion` removes translation and scale, leaving only a short
opacity transition. No element pulses continuously. Claim and quest state
changes use simple color and copy updates.

## End-of-run state model

Each gameplay attempt owns a monotonically increasing `runId`. The result
snapshot contains at least the run ID, steps, previous record, resulting record,
session coins, local XP estimate, local XP breakdown, local rating, selected
loadout, and claim state.

The end-of-run flow is:

1. The first accepted death transition marks the run as ending and rejects
   subsequent death callbacks for the same `runId`.
2. Continue eligibility is resolved before Run Complete is scheduled.
3. Accepting Second Chance cancels all pending completion presentation for that
   run and returns it to active gameplay.
4. Declining, failing, or timing out Continue finalizes the result exactly once.
5. Run Complete is presented once with local values after the death transition.
6. Authoritative server data patches fields in the existing result snapshot; it
   never calls the screen-presentation method.
7. Starting another run or returning to Menu invalidates pending presentation
   timers and prevents stale responses from changing the visible screen.

Presentation and reconciliation are separate operations:

- `presentRunComplete(result)` performs the one-time screen transition and
  initial render. It is idempotent for a `runId`.
- `patchRunComplete(runId, patch)` updates eligible result fields only when the
  supplied run still owns the visible result. It cannot change screen
  visibility, reopen a hidden screen, reset gear selection, or reset claim
  state.

The exact function names may follow existing module conventions, but the split
between one-time presentation and in-place reconciliation is required.

## Starting the next run

`START NEXT RUN` validates the currently displayed selections using the same
rules as standalone Loadout and then starts gameplay directly.

- Selected skin and trail become the active cosmetic choices.
- Selected boosters are reserved and consumed through the existing start-run
  path; no duplicate inventory deduction is introduced.
- The new attempt receives a new `runId` before any gameplay event can fire.
- Completion timers and transient result UI from the prior run are cleared.
- The standalone Loadout screen is not shown during this path.
- If a selection becomes unavailable due to reconciled inventory, the invalid
  choice is removed, counts are refreshed, and the player remains on Run
  Complete with a clear inline message rather than starting with stale data.

## Onchain claim behavior

`CLAIM ONCHAIN` is shown only under the existing eligibility conditions: a
connected wallet and a non-zero claimable score.

- The first accepted click disables duplicate activation immediately.
- Copy progresses through the existing semantic states:
  `CLAIMING...`, `CONFIRMING...`, and `CLAIMED`.
- Claim state is keyed to the run and score being claimed rather than inferred
  solely from the shared DOM button.
- XP, rating, quest, or balance reconciliation cannot reset an in-progress or
  completed claim state.
- Claim events from an older run cannot update the current result card.
- Rejected or failed claims restore an actionable state for the same run and
  surface the existing error feedback without reopening Run Complete.
- Starting another run or returning to Menu does not cancel a submitted wallet
  transaction. A late completion may update durable claim state, but it must not
  mutate a different run's visible button.

## Quest, level-up, and reward updates

- A claimable quest appears as a compact success-mint row in the result card and
  retains its existing navigation to Quests.
- Authoritative reward or quest data updates the visible row in place for the
  matching `runId`.
- A queued level-up modal may appear once over Run Complete and returns to the
  same screen when dismissed.
- Reconciliation must not replay entrance motion, refocus the screen, reset its
  scroll position, or alter the selected next-run build.

## Error handling

- A failed score submission leaves local result values visible and does not
  delay access to Loadout controls or the next-run action.
- Malformed or missing authoritative fields are ignored individually; valid
  local values remain intact.
- Duplicate callbacks, repeated collision frames, and repeated timer callbacks
  are harmless because completion and presentation are idempotent per `runId`.
- Leaving Run Complete makes subsequent UI patches for that result no-ops.
- Button handlers are bound once during UI initialization. Rendering or patching
  the result does not add listeners.

## Accessibility and responsive behavior

- Skin, trail, booster, claim, next-run, and menu controls retain explicit
  accessible names and visible keyboard focus.
- Disabled inventory and transaction states remain programmatically disabled.
- The sticky action area remains reachable at narrow mobile widths, short
  heights, landscape orientation, and with bottom safe-area insets.
- Dynamic result updates do not move focus. The claim status element uses
  `aria-live="polite"` so transaction copy changes are announced without
  interrupting gameplay controls.
- Touch targets remain at least the size used by current Loadout controls.

## Verification and acceptance criteria

Automated coverage must include:

1. A finished run presents Run Complete exactly once.
2. Repeated death/completion callbacks for one `runId` do not repeat the screen
   transition or reward processing.
3. A server response arriving before the former 600 ms local timer cannot be
   overwritten by a delayed local render.
4. A slow server response updates result fields in place without replaying the
   screen or entrance animation.
5. A response from a previous run cannot alter a newer run, Menu, or gameplay.
6. Accepting Second Chance prevents Run Complete from appearing for that death.
7. Continue timeout or decline presents Run Complete once.
8. `START NEXT RUN` uses the visible selections, deducts selected boosters once,
   assigns a new `runId`, and starts without standalone Loadout.
9. Play from Menu still opens standalone Loadout.
10. Claim double-clicks submit once; reconciliation does not reset claim state;
    stale claim events do not alter a new result.
11. Quest and level-up updates do not reopen or reset Run Complete.
12. The screen remains usable at 360 x 640 portrait, 390 x 844 portrait, and
    844 x 390 landscape sizes with every conditional row reachable by scroll.
13. Reduced-motion mode removes result translation and scale effects.

Manual visual verification covers ordinary, new-record, rating, reward,
claimable-quest, onchain-eligible, claim-in-progress, claimed, no-wallet,
short-screen, and reduced-motion states. Existing economy, rating, quest,
loadout, score submission, JavaScript syntax, TypeScript, lint, and production
build checks must continue to pass.

## Out of scope

- Changing gameplay physics, collision rules, death effects, Continue price, or
  Second Chance rules.
- Changing reward amounts, XP formulas, rating thresholds, quest rotation, or
  booster inventory authority.
- Changing smart contracts or wallet providers.
- Redesigning standalone Loadout, Menu, Shop, Quests, Leaders, or Profile beyond
  shared styles required by Run Complete.
