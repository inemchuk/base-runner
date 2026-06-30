# Base Runner Economy V1 Design

## Goal

Make the game economy feel intentional and collectible without moving the core
economy on-chain yet. Each run should create visible progress toward a desired
reward, and daily systems should feed shop value instead of only adding coins.

Target direction: midcore collectible economy.

- Small reward: every run.
- Meaningful progress: every active day.
- New common cosmetic or major progress milestone: about every 3-5 active days.
- New rare cosmetic: about every 5-10 active days.
- Epic cosmetic: about 1-2 weeks.
- Legendary cosmetic: about 3-5 weeks unless it is an event reward.
- Boosters: common enough that players use loadout strategically.

## Current Baseline

The current game already has the right systems, but their rewards are too
coin-heavy and disconnected.

- Coins spawn in runs at roughly one coin per 15-20 steps before boosters.
- Boosters exist as consumable charges: magnet, double coins, second chance.
- Shop sells skins, trails, death effects, and booster packs.
- Daily check-in currently pays mostly small coins with a day-7 booster bonus.
- Daily spin can award coins, boosters, trails, and full skins.
- Quests are cumulative and currently pay only coins.
- XP/level rewards sometimes unlock skins/trails, with coin filler rewards.
- Spin cost is `spinsToday * 50`, so the first daily spin is free.
- Pre-run loadout exists in the current local code and is a dependency for the
  booster economy. If loadout is removed or rolled back, booster rewards should
  be treated as generic consumables rather than strategy rewards.

## Blocking Corrections From Spec Review

These constraints must be true before implementation is considered deployable.

- Fragment and coin income must be budgeted against the target unlock timing.
- Fragment earning and crafting must be server-authoritative before deployment.
  A local-only prototype is allowed, but client-authored fragments cannot be
  shipped as a collectible currency.
- Legendary/top-tier cosmetics cannot be cheaply bypassed through direct coin
  purchase. They should be fragment-first, event-based, or priced far above the
  craft path.
- `Focus fragments` are a UI abstraction. Storage remains per item. Do not add
  universal fragments in V1.
- Focus selection and crafting must validate that the target item exists, is
  cosmetic, is not already owned, and is craftable.
- The data model must preserve current equipped fields: `equippedTrail` and
  `equippedDeath`.

## Core Mechanic: Focus Item

Add a player-selected `Focus Item`.

A Focus Item is one cosmetic the player is currently working toward:

- skin
- trail
- death effect

Daily spin, check-in, quests, and level rewards can award progress toward this
item. This turns generic rewards into personal progress.

Example UI language:

- `Fire Trail 7/20`
- `+2 Focus fragments`
- `Ready to craft: Fire Trail`

Only one Focus Item is active at a time. The player can change it in Shop, but
changing focus should not erase progress. Progress is stored per item.

Focus selection rules:

- Item ID must exist in the cosmetic catalog.
- Item must be a skin, trail, or death effect.
- Item must not already be owned.
- Item must have a fragment target.
- If the selected item becomes owned, the UI should prompt the player to choose
  a new Focus Item.

## Currencies And Resources

### Coins

Soft utility currency.

Used for:

- booster packs
- continue
- paid spins
- cosmetic craft fees
- limited daily fragment chest
- shop refresh/reroll
- temporary run modifiers

Coins should not be the only path to cosmetics.

### XP

Long-term account progression.

XP should remain tied to run performance:

- score
- session coins
- check-in streak bonus
- new record bonus

Levels should provide guaranteed milestones.

### Booster Charges

Short-term tactical resource.

Boosters should be awarded often enough that players are not afraid to use
them. Loadout becomes the main pre-run strategy layer.

### Focus Fragments

Primary collectible progress resource.

Fragments are item-specific under the hood but can be presented simply as
progress on the selected Focus Item. This avoids creating a confusing inventory
with many shard types.

Example stored data:

```ts
focusItemId: "trail_fire"
fragmentProgress: {
  trail_fire: 7,
  skin_8: 3
}
```

V1 must not introduce universal fragments. If the current Focus Item is already
ready to craft and the player has not selected a new focus, fragment rewards
convert to coins using the source's fallback value.

Deployment rule: fragments and craft state can be local-only during prototype
work, but the deployable implementation must award fragments and process
crafting through server-authoritative code.

## Cosmetic Unlock Model

Each paid cosmetic should have two paths:

- direct coin purchase
- fragment craft

Crafting requires reaching the fragment target and paying a smaller coin fee.
This keeps coins relevant while making progress rewards valuable.

Suggested V1 tiers:

| Tier | Examples | Fragment Target | Craft Fee | Direct Price |
| --- | --- | ---: | ---: | ---: |
| Common | early trails, simple death effects | 10 | 80 | 150-200 |
| Rare | early skins, better trails | 20 | 180 | 450-650 |
| Epic | premium skins/effects | 35 | 350 | 900-1400 |
| Legendary | top skins/trails | 60 | 750 | fragment-only or 2500-4000 |

Direct prices for common items can stay close to current values. Rare and above
need wider separation so direct coin purchase does not bypass the collectible
loop. Legendary items should default to fragment-only in V1 unless there is a
specific event/store reason to sell them directly.

## Reward Design

### Run Rewards

Runs should still reward mostly coins and XP, but game over should show broader
progress.

Game over summary should eventually show:

- coins earned this run
- XP earned
- quest progress
- Focus Item progress if gained
- next nearest reward

Example:

```text
+14 coins
+42 XP
Fire Trail 9/20
Quest reward in 18 rows
```

### Daily Check-In

Daily check-in should be a predictable streak ladder, not just small coins.

Proposed 7-day cycle:

| Day | Reward |
| ---: | --- |
| 1 | 15 coins |
| 2 | 1 random booster |
| 3 | 2 Focus fragments |
| 4 | 25 coins + 1 random booster |
| 5 | 3 Focus fragments |
| 6 | 40 coins + 50 XP |
| 7 | Gear Crate: 5 Focus fragments + 3 boosters |

Every 28 total check-ins:

- guaranteed cosmetic unlock, or
- legendary crate, if direct unlock feels too generous.

Recommended V1: use legendary crate rather than guaranteed legendary item.

### Daily Spin

Spin should accelerate progress and create excitement without flooding players
with full skins.

Recommended prize pool:

| Prize Type | Weight | Notes |
| --- | ---: | --- |
| Small coins | 24% | 15-50 coins |
| Booster charges | 24% | 1-2 charges |
| Focus fragments | 26% | 1-4 fragments |
| XP burst | 10% | 50-150 XP |
| Fragment burst | 8% | 5-8 Focus fragments |
| Direct trail/skin unlock | 5% | duplicate protected |
| Jackpot cosmetic/crate | 2% | rare/legendary |
| Empty/light miss | 1% | optional; keep very low |

Current spin has too much direct skin/trail outcome weight for a controlled
collectible economy. V1 should make full unlocks rare and make fragments the
main reward.

Duplicate handling:

- If a full cosmetic prize is already owned, reroll to unowned item in same tier.
- If all items in that tier are owned, convert to capped coins + boosters.
- If Focus Item is already ready to craft, fragment rewards convert to coins
  until the player crafts it or chooses a new focus.

### Quests

Quests should become the main long-term progression source.

Each quest keeps 8 levels, but rewards should alternate between utility and
collectible progress.

Suggested per-quest pattern:

| Quest Level | Reward Type |
| ---: | --- |
| 1 | coins |
| 2 | booster charge |
| 3 | Focus fragments |
| 4 | booster pack |
| 5 | larger Focus fragments |
| 6 | rare crate |
| 7 | large Focus fragments |
| 8 | exclusive cosmetic or epic crate |

This gives each quest an identity:

- `Marathon Runner`: trails and movement-themed rewards.
- `Coin Collector`: coin trail, gold skin variants, coin packs.
- `Dedicated Player`: booster packs and daily-style crates.
- `High Scorer`: prestige cosmetics and rare crates.

### Level Rewards

Levels should feel like guaranteed milestones. Avoid too many plain coin levels.

Suggested early/mid track:

| Level | Reward |
| ---: | --- |
| 2 | booster pack |
| 3 | first trail unlock |
| 5 | Focus chest |
| 7 | death effect |
| 10 | guaranteed skin |
| 12 | Focus chest |
| 15 | epic trail |
| 20 | rare skin |
| 25 | epic crate |
| 30 | legendary skin |
| 35 | legendary trail |
| 40+ | prestige variants / seasonal crates |

Coin-only level rewards should be reduced or paired with fragments.

## Shop Design

### Shop Sections

V1 shop sections:

- Skins
- Trails
- Death effects
- Boosters
- Focus

The Focus section can also be integrated into each cosmetic item card:

- `Set Focus`
- progress bar
- `Craft` when ready

### Coin Sinks

Add more useful coin spending:

- booster packs
- continue
- paid spins
- craft fees
- top-up missing fragments near craft completion
- daily fragment chest, limited to 1-3 buys/day
- shop refresh/reroll
- run modifiers in a later phase

Top-up rule:

- Only appears when an item is at least 80% complete.
- Can buy at most 20% of the fragment target.
- Suggested cost per missing fragment: common 20 coins, rare 35, epic 60.
- Legendary top-up is disabled in V1 or capped to one fragment/day at a high
  price.

Run modifiers are not part of the first economy implementation. They require
engine integration and should be treated as a separate feature after the core
economy works.

Candidate run modifiers:

- `Coin Rush`: higher coin density for one run.
- `XP Run`: +25% XP for one run.
- `Fragment Hunt`: next run can earn 1 Focus fragment after a score target.

If added later, these should cost coins and be mutually exclusive with some
boosters if needed to avoid stacking too much value.

## Balance Targets

Assumptions for V1:

- Casual active player: 3-6 runs/day.
- Good active player: 8-15 runs/day.
- First free spin/day.
- Daily check-in used by most returning players.
- Quests progress naturally through normal play.

### Fragment Budget

Baseline fragment income if the player keeps one Focus Item selected:

| Source | Expected Focus Fragments |
| --- | ---: |
| Check-in 7-day cycle | 10/week |
| Free daily spin | about 1.17/day, 8.2/week |
| Quests | variable, target 4-8/week for active casual players |
| Level rewards | lumpy, target 4-8/week during early progression |
| Daily fragment chest | optional coin sink, player-paid |

Free daily spin estimate:

- `Focus fragments`: 26% * average 2.5 fragments = 0.65/day.
- `Fragment burst`: 8% * average 6.5 fragments = 0.52/day.
- Combined free-spin fragment EV: about 1.17/day.

Expected weekly focus progress:

- Check-in + free spin only, every day: about 18 fragments/week.
- Casual 5 active days/week with check-in/spin: about 13 fragments/week.
- Casual with natural quest claims: about 17-22 fragments/week.
- Good active player with quests/levels/chests: about 25-35 fragments/week.

Expected unlock timing:

- First trail/common cosmetic: 3-6 active days.
- First rare cosmetic: 7-10 active days baseline, 5-7 with quests/chests.
- Epic cosmetic: 12-18 active days.
- Legendary cosmetic: 21-35 active days.

These timings assume the player does not constantly switch focus. Switching
focus is allowed, but it naturally spreads progress across multiple items.

### Coin Budget

Current run coin income is low: coins spawn at roughly one coin per 15-20 steps
before boosters. A normal player with 3-6 short/medium runs will often earn only
6-30 run coins/day before daily systems and boosters.

Expected coin income:

| Source | Expected Coins |
| --- | ---: |
| Runs, casual 3-6/day | 6-30/day |
| Runs, active/good 8-15/day | 20-75/day |
| Check-in proposed cycle | 80/week, about 11/day |
| Free spin coins | about 8/day from small coin slots |
| Quests | variable, target 5-15/day equivalent early |

Expected total:

- Casual: about 25-65 coins/day.
- Good active player: about 45-110 coins/day.

Direct coin prices must be set so coins do not bypass fragments:

- Common direct buy can be reachable in a few active days.
- Rare direct buy should usually take 1-2 weeks unless the player spends saved
  coins.
- Epic direct buy should take multiple weeks.
- Legendary direct buy should be disabled or priced as a whale/prestige path,
  not as the normal path.

Boosters should be net-positive in fun, not always net-positive in coins.
Example:

- Magnet improves collection consistency.
- Double coins can pay back when used well.
- Shield helps push score/XP/quest progress more than raw coin profit.

## Data Model Changes

Add to shop/economy save data without removing existing fields.

```ts
type EconomyProgress = {
  focusItemId: string | null;
  fragments: Record<string, number>;
  dailyFragmentChestDate?: string;
  dailyFragmentChestBuys?: number;
}
```

This can live inside local `shop_v1` during prototype work and inside Redis
`shop:${addr}` for server storage. The deployable API must not blindly accept
client-written fragment balances.

```ts
{
  owned: string[],
  equipped: string,
  boosterCharges: Record<string, number>,
  trailPacks: string[],
  equippedTrail: string,
  deathPacks: string[],
  equippedDeath: string,
  focusItemId: string | null,
  fragments: Record<string, number>,
  dailyFragmentChestDate?: string,
  dailyFragmentChestBuys?: number
}
```

Server-authoritative operations:

- `setFocus(address, itemId)`: validates item existence, cosmetic type,
  ownership, and craftability.
- `awardFragments(address, source, itemId, amount)`: server-side reward grant.
- `craftFocusItem(address, itemId)`: validates fragment target and craft fee,
  deducts fee, consumes/locks fragments as needed, grants ownership.
- `topUpFragments(address, itemId, amount)`: validates 80% threshold, tier cap,
  and coin cost.

`/api/shop` can still read state and support local development sync, but
fragment mutation, crafting, and paid/direct ownership grants require dedicated
server-authoritative paths before deployment. Equipping an already-owned item is
safe as a lower-risk client request if the server verifies ownership.

## UI Changes

### Shop

Each locked cosmetic card should show:

- item preview
- price
- fragment progress
- `Set Focus`
- `Craft` if ready

### Main Menu

Show a compact Focus progress strip:

```text
Fire Trail 9/20
```

This makes returning to the menu feel like progress.

### Game Over

Show a reward summary:

- run coins
- XP
- quest progress highlight
- Focus progress if gained
- nearest next reward

### Daily Screens

Daily check-in and spin should visibly mention Focus fragments when awarded.

## Telemetry

Economy tuning needs measurable events. Add lightweight events before broad
tuning, using the existing analytics path if available and local dev logging as
fallback.

Required events:

- `economy_focus_set`: item, tier, previous item, current progress.
- `economy_fragment_earned`: source, item, amount, before, after.
- `economy_reward_claimed`: source, reward type, value.
- `economy_coin_earned`: source, amount.
- `economy_coin_spent`: sink, amount, balance after.
- `economy_booster_acquired`: source, booster id, amount.
- `economy_booster_used`: booster id, score, session coins.
- `economy_craft_available`: item, tier, missing fee if any.
- `economy_craft_completed`: item, tier, fragments used, coins spent.
- `economy_focus_switched`: from item, to item, old progress, new progress.
- `economy_spin_result`: cost, prize type, value, rarity.
- `economy_checkin_claimed`: streak day, reward bundle.
- `economy_quest_claimed`: quest id, quest level, reward bundle.
- `economy_level_reward_claimed`: level, reward bundle.

Metrics to review:

- fragments/day by source
- coins/day by source
- craft completion rate
- focus switch rate
- direct purchase vs craft ratio
- booster hoarding vs usage
- paid spin usage and net value
- top-up usage near completion

## Terminal State

When a player owns every cosmetic in a reward tier:

- Full cosmetic drops reroll to another unowned tier if possible.
- If no eligible cosmetics remain, rewards convert to coins and boosters.
- Paid fragment chests should hide or become disabled when no craftable target
  exists.
- Legendary overflow should not become an infinite coin printer; cap conversion
  values and reserve prestige variants/seasons for a later system.

## Implementation Phases

### Phase 0: Loadout Precondition

- Keep pre-run loadout available before economy rewards lean on boosters.
- Verify selected boosters are consumed only when a run starts.
- Verify booster HUD/effects still reflect selected loadout.
- If loadout is unavailable, do not increase booster reward frequency yet.

### Phase 1: Local Economy Prototype

- Add focus item and fragment progress to local shop data.
- Add helper functions: set focus, add fragments, get craft status, craft item.
- Add UI progress on shop cards.
- Add validation for focus selection and craft eligibility.
- Keep this phase strictly local. Do not deploy client-authoritative fragments.

### Phase 2: Server Authority For Fragments And Craft

- Extend server storage for `focusItemId` and `fragments`.
- Add server-authoritative focus, fragment award, craft, and top-up actions.
- Keep local fallback for localhost only.
- Ensure `/api/shop` does not become a trust-heavy fragment write endpoint.
- Add duplicate protection and conversion rules server-side.

### Phase 3: Reward Sources

- Update daily check-in reward table.
- Update daily spin prize pool server-side.
- Update quest rewards from coins-only to mixed rewards.
- Update level rewards to include booster packs, crates, and fragments.
- Keep all fragment grants routed through the server-authoritative reward path
  for any deployed build.

### Phase 4: Reward Presentation And Telemetry

- Improve game over summary.
- Add focus progress strip to menu/profile/loadout where useful.
- Add clearer reward animations for fragments and crates.
- Add economy telemetry events.

### Phase 5: Anti-Abuse And Economy Tuning

- Review fragment earn rate, craft rate, coin sink usage, and focus switching.
- Tune drop rates and prices from telemetry.
- Add diminishing returns or caps for paid spins if needed.
- Define terminal-state behavior for players who own everything.

### Phase 6: Future Onchain Layer

Only after retention and reward sinks work:

- mint fully unlocked cosmetics
- optional seasonal crates
- optional token later, not before economy proof

## Open Decisions

1. Whether fragments should be strictly item-specific or use a universal
   `Focus fragments` abstraction in UI with per-item storage internally.
   Decision for V1: Focus abstraction in UI, per-item storage internally. No
   universal fragment currency.

2. Whether direct coin purchase remains for all cosmetics.
   Recommendation: yes for common/rare/epic, but with higher direct prices.
   Legendary should be fragment-only by default.

3. Whether paid spin can be bought many times per day.
   Recommendation: keep scaling cost, but cap meaningful value after several
   spins or add diminishing rewards.

4. Whether day-28 reward is guaranteed cosmetic or crate.
   Recommendation: crate in V1, guaranteed cosmetic later for seasons.

5. Whether run modifiers belong in Economy V1.
   Recommendation: no. Keep them as a later coin-sink feature because they touch
   world generation, XP calculation, and reward validation.

## Success Criteria

The economy is working if:

- Player can explain what they are working toward.
- Loadout boosters are used regularly, not hoarded forever.
- Shop feels connected to daily spin/check-in/quests.
- Game over feels rewarding even after a mediocre run.
- Coins have multiple useful sinks.
- Cosmetics are paced enough to feel valuable.
- Free fragment income lands near 13-22 fragments/week for casual active users.
- Direct purchases do not dominate rare/epic/legendary unlocks.
- Craft/top-up is used near completion without replacing the whole fragment
  journey.
- Paid spin does not become the highest-value path to every cosmetic.
