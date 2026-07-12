# Runner Hub Design

## Goal

Turn Shop, Quests, and Profile into a cohesive Runner Hub without rebuilding the main menu or changing the five-button navigation model players already know.

## Product decisions

- Keep the existing five destinations in the same order: Shop, Quests, Play, Leaders, Profile.
- Keep Play as the raised center action and continue opening Loadout from it.
- Make the navigation persistent on Menu, Shop, Quests, and Profile. Shop, Quests, and Profile no longer need large Back buttons.
- Leave Leaders functionally unchanged in this pass.
- Preserve all existing wallet, onchain, shop, level, and quest data. Existing `quests_v1` progress must migrate without a reset.

## Visual direction

The hub is a compact arcade dossier for a Base runner. It should feel like a game interface, not a generic dashboard.

- **Void** `#050814`: page background.
- **Deep lane** `#081126`: primary panels.
- **Base blue** `#0052FF`: navigation and active controls.
- **Signal blue** `#4D8FFF`: secondary progress and labels.
- **Reward gold** `#FFD700`: rewards and owned/equipped highlights only.
- **Success mint** `#69F0AE`: completed and claimable states.
- Continue using the current monospace arcade type system so the redesigned screens remain part of the same game.
- The signature element is the Runner Stage in Shop: a large equipped-character silhouette framed like a lit start lane, with compact economy readouts around it.
- Avoid expensive blur and continuous DOM animation. Motion is limited to short state transitions and respects reduced motion.

## Shared Runner Hub navigation

The existing tab bar becomes a fixed shared shell for hub screens. `UI.show(name)` controls its visibility and active state. Each destination has `aria-current="page"` while active. The menu remains visually recognizable; only its lower spacing changes to account for the fixed bar.

The raised center action always remains Play and opens Loadout. Shop, Quests, Leaders, and Profile each expose a compact `← HOME` control in the left side of the screen heading. Home returns to Menu, where Today, Daily Check-in, and Daily Spin are available. Loadout and gameplay remain outside the hub and continue hiding the navigation.

Leaders uses the same persistent shell, heading, scroll clearance, and active-tab treatment as Shop, Quests, and Profile. Its leaderboard modes and data behavior do not change, and its separate Back bar is removed.

## Shop

Shop is organized from context to action:

1. A compact header identifies the section and shows the live coin balance.
2. Runner Stage previews the equipped skin and shows collection ownership.
3. Segmented categories switch between Skins, Boosters, and Trails.
4. The existing catalog keeps all purchase, focus, fragment, craft, NFT claim, and equip behavior, but cards gain stronger hierarchy and clearer owned/equipped states.

The implementation does not change prices, crafting rules, or ownership authority.

## Profile

Profile becomes a Runner Passport:

1. Identity header: avatar, name/address, level.
2. XP rail with an explicit next-reward summary; tapping it still opens Level Rewards.
3. Performance trio: Global Rank, Best Score, and current Check-in Streak.
4. Compact **Career** section containing Games, Rows, Coins, and Check-ins, as requested.
5. Collection summary, booster inventory, and equipped skin/trail.

All values are derived from existing local/server state. No new profile authority is introduced.

## Quests

Quests are split into three visible groups:

- **Daily — 3 active:** deterministic UTC-day rotation from a pool of run, row, coin, quality, and score objectives.
- **Weekly — 2 active:** deterministic ISO-week rotation with larger targets.
- **Career — 5 tracks:** the existing permanent eight-level tracks.

Daily and weekly progress is credited only through the same accepted score-submit path as Career progress when connected. Offline play continues to use the local fallback and reconciles by period and maximum progress when the server becomes available.

Rotation rewards are intentionally capped:

- Daily pool rewards are `10 coins`, `15 XP`, `10 coins`, `20 XP`, or `1 booster`; at most three are active.
- Weekly pool rewards are `50 XP`, `35 coins`, `1 booster`, `60 XP`, or `40 coins`; at most two are active.
- No daily or weekly objective directly awards fragments, crates, or cosmetics.

The quest state adds rotation data alongside the existing five top-level Career entries, so old state remains readable. Claims include the period in their identity and cannot be replayed after a reset.

## Error handling and reconciliation

- Server claim rejection rolls back the optimistic local grant, as Career claims do now.
- A period mismatch replaces rotation progress rather than merging progress across days or weeks.
- Same-period server and local progress reconcile by maximum progress and claimed union.
- Unknown or malformed quest state normalizes to safe zero progress.

## Verification

- Unit tests cover legacy migration, deterministic rotation, period reset, progress updates, scoped claims, and reward caps.
- Existing economy tests, TypeScript, ESLint, build, JavaScript syntax, and whitespace checks must pass.
- Responsive review covers narrow mobile width, short viewport height, persistent navigation, scroll clearance, focus visibility, and reduced motion.
