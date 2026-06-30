# Base Runner Economy V1 Design

## Goal

Make the game economy feel intentional and collectible without moving the core
economy on-chain yet. Each run should create visible progress toward a desired
reward, and daily systems should feed shop value instead of only adding coins.

Target direction: midcore collectible economy.

- Small reward: every run.
- Meaningful progress: every active day.
- New common/rare cosmetic: about every 3-5 active days.
- Epic/legendary cosmetic: about 1-3 weeks.
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
| Rare | early skins, better trails | 20 | 180 | 300-450 |
| Epic | premium skins/effects | 35 | 350 | 500-700 |
| Legendary | top skins/trails | 60 | 750 | 800-1200 |

Direct prices can stay close to current values, but the player now has a
non-random path toward items.

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
- If all items in that tier are owned, convert to coins + Focus fragments.
- If Focus Item is already ready to craft, fragment rewards become universal
  fragments or coins until the player picks a new focus.

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
- daily fragment chest, limited to 1-3 buys/day
- shop refresh/reroll
- run modifiers

Recommended run modifiers:

- `Coin Rush`: higher coin density for one run.
- `XP Run`: +25% XP for one run.
- `Fragment Hunt`: next run can earn 1 Focus fragment after a score target.

These should cost coins and be mutually exclusive with some boosters if needed
to avoid stacking too much value.

## Balance Targets

Assumptions for V1:

- Casual active player: 3-6 runs/day.
- Good active player: 8-15 runs/day.
- First free spin/day.
- Daily check-in used by most returning players.
- Quests progress naturally through normal play.

Expected unlock timing:

- First trail: within first 1-2 sessions.
- First non-free skin: day 2-4.
- Rare cosmetic: day 4-7.
- Epic cosmetic: week 1-2.
- Legendary cosmetic: week 2-4.

Boosters should be net-positive in fun, not always net-positive in coins.
Example:

- Magnet improves collection consistency.
- Double coins can pay back when used well.
- Shield helps push score/XP/quest progress more than raw coin profit.

## Data Model Changes

Add to shop/economy save data:

```ts
type EconomyProgress = {
  focusItemId: string | null;
  fragments: Record<string, number>;
  dailyFragmentChestDate?: string;
  dailyFragmentChestBuys?: number;
}
```

This can live inside `shop_v1` initially to keep implementation simple:

```ts
{
  owned: string[],
  equipped: string,
  boosterCharges: Record<string, number>,
  trailPacks: string[],
  deathPacks: string[],
  focusItemId: string | null,
  fragments: Record<string, number>
}
```

Server sync should include the new fields in `/api/shop`.

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

## Implementation Phases

### Phase 1: Local Economy Core

- Add focus item and fragment progress to local shop data.
- Add helper functions: set focus, add fragments, get craft status, craft item.
- Add UI progress on shop cards.
- Keep everything local/server-compatible but do not deploy.

### Phase 2: Reward Sources

- Update daily check-in reward table.
- Update daily spin prize pool.
- Update quest rewards from coins-only to mixed rewards.
- Update level rewards to include booster packs, crates, and fragments.

### Phase 3: Reward Presentation

- Improve game over summary.
- Add focus progress strip to menu/profile/loadout where useful.
- Add clearer reward animations for fragments and crates.

### Phase 4: Server Sync And Anti-Abuse

- Extend `/api/shop` schema.
- Move spin fragment rewards server-side.
- Keep local fallback for dev.
- Add basic duplicate protection and conversion rules server-side.

### Phase 5: Future Onchain Layer

Only after retention and reward sinks work:

- mint fully unlocked cosmetics
- optional seasonal crates
- optional token later, not before economy proof

## Open Decisions

1. Whether fragments should be strictly item-specific or use a universal
   `Focus fragments` abstraction in UI with per-item storage internally.
   Recommendation: Focus abstraction in UI, per-item storage internally.

2. Whether direct coin purchase remains for all cosmetics.
   Recommendation: yes for V1, but expensive items should strongly favor
   fragment crafting.

3. Whether paid spin can be bought many times per day.
   Recommendation: keep scaling cost, but cap meaningful value after several
   spins or add diminishing rewards.

4. Whether day-28 reward is guaranteed cosmetic or crate.
   Recommendation: crate in V1, guaranteed cosmetic later for seasons.

## Success Criteria

The economy is working if:

- Player can explain what they are working toward.
- Loadout boosters are used regularly, not hoarded forever.
- Shop feels connected to daily spin/check-in/quests.
- Game over feels rewarding even after a mediocre run.
- Coins have multiple useful sinks.
- Cosmetics are paced enough to feel valuable.
