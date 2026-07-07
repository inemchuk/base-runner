# Fragment Pool — Design

Date: 2026-07-07
Status: Approved (pending spec review)

## Problem

Spin (and check-in / crates) can award "Focus Fragments". Fragments are stored
**per craftable item** (`shop.fragments[itemId]`), not as a shared currency.
Today, if the player has no focus item set (or the focus item is already full),
awarded fragments are silently converted to coins at `FRAGMENT_FALLBACK_COINS`
(10 each) via `applyFocusFragments`. The result card still says
"+3 Focus Fragments", but the focus item shows 0 — it reads as a loss.

Two code paths implement this fallback:

- `src/lib/economy/rewards.ts` → `applyFocusFragments` (used by the check-in
  claim route `src/app/api/economy/claim/route.ts`).
- `src/app/api/spin/route.ts` → its own local `applyFocusFragments` /
  `applyContainer`.

## Decision

Introduce a **fragment pool**: a single untyped counter of unassigned
fragments. Fragments are never converted to coins anymore.

- **No focus set (or focus full)** → fragments go to the pool.
- **Focus set and not full** → fragments fill the focus item to its
  requirement; overflow goes to the pool (not coins).
- **Player sets a focus** → the pool automatically drains into that item, up to
  the item's requirement, with a **per-tier cap** on how much of the item the
  pool may fill. Remainder stays in the pool.

The pool is fungible across tiers, but legendary items are capped so they can't
be trivially completed from banked spin fragments.

### Tier fill cap (`poolCapPct`)

New per-tier config field `poolCapPct` — the fraction of an item's fragment
requirement the pool is allowed to fill:

- common / rare / epic: `poolCapPct = 1.0` (pool may fill 100%)
- legendary: `poolCapPct = 0.5` (pool may fill at most 30 of 60; the rest must
  come from direct fragment drops earned while the legendary is the focus,
  which are uncapped)

The cap is **cumulative per item** so it can't be bypassed by toggling focus
on and off. We track pool-sourced fragments separately from direct drops.

## Data Model

`EconomyShopData` (in `src/lib/economy/core.ts`) gains:

```ts
pooledFragments: number;                    // unassigned fragment bank, >= 0
poolAppliedFragments: Record<string, number>; // pool fragments already poured per itemId (cap accounting)
```

- `normalizeShopData` normalizes both (floor, clamp >= 0; drop zero entries in
  the record, same as `fragments` / `topUpFragments`).
- `DEFAULT_SHOP` sets `pooledFragments: 0`, `poolAppliedFragments: {}`.

Per-item `fragments[itemId]` stays the visible progress toward crafting a
specific item. The pool is the "not yet assigned" bucket.

## Core Logic (`src/lib/economy/core.ts`)

Add one shared primitive so both award paths use identical logic:

```ts
awardFragmentsToShop(state, amount): { state, toFocus, toPool }
```

Behavior:
1. If a valid, unowned, not-full focus item exists: fill it up to
   `meta.fragments` (respecting the pool cap is **not** needed here — direct
   fills into the active focus are uncapped). Overflow beyond the requirement →
   pool.
2. If no eligible focus: entire amount → pool.
3. Never returns coins. `FRAGMENT_FALLBACK_COINS` and the whole
   `fallbackCoins` concept are removed from the fragment path.

Update `setFocus(state, itemId)`:
- After setting `focusItemId`, drain the pool into the item:
  - `requirement = meta.fragments`
  - `current = fragments[itemId] || 0`
  - `capTotal = floor(requirement * tier.poolCapPct)`
  - `alreadyPooled = poolAppliedFragments[itemId] || 0`
  - `allowedFromPool = max(0, capTotal - alreadyPooled)`
  - `drain = min(pooledFragments, requirement - current, allowedFromPool)`
  - Apply: `fragments[itemId] += drain`, `pooledFragments -= drain`,
    `poolAppliedFragments[itemId] += drain`.

`craftItem` unchanged (reads `fragments[itemId] >= meta.fragments`). On
successful craft it already zeroes `fragments[itemId]` and `topUpFragments`;
also zero `poolAppliedFragments[itemId]` for cleanliness (item is owned; won't
be re-focused, but keep state tidy).

`topUpFragments` unchanged (its own cap via `topUpCapPct` is independent of the
pool cap).

## Config (`src/lib/economy/config.ts`)

- Add `poolCapPct: number` to `TierConfig` and to each `ECONOMY_TIERS` entry
  (1.0 for common/rare/epic, 0.5 for legendary).
- `FRAGMENT_FALLBACK_COINS` is no longer used by the fragment path. Remove it
  and its imports (spin route, claim route, rewards.ts) unless another consumer
  remains — confirm during implementation.

## Award Call Sites

Both must route overflow to the pool via `awardFragmentsToShop`:

- `src/lib/economy/rewards.ts` — replace `applyFocusFragments` /
  `addFallbackCoins` with `awardFragmentsToShop`. Result reporting: replace
  `fragmentsOverflowed` (previously "converted to coins") with `fragmentsPooled`;
  drop `fallbackCoins`.
- `src/app/api/spin/route.ts` — replace local `applyFocusFragments` /
  `applyContainer` fallback with the shared primitive. `AwardedPrize` loses
  `fallbackCoins`; `fragmentsOverflowed` → `fragmentsPooled`.

Telemetry (`src/lib/economy/telemetry.ts`): the overflow event's meaning changes
from "fragments → coins" to "fragments → pool". Rename field to
`fragmentsPooled`, drop `fallbackCoins`. Keep an event so we can still observe
pool inflow.

## Client (`public/game/game.js`)

- Local shop mirror (the objects built ~lines 6233 and 6257) must carry
  `pooledFragments` and `poolAppliedFragments`, and `normalize`-equivalent guards
  (~line 6415) must default them.
- Local `setFocusItemLocal` must mirror the server pool-drain so the offline /
  no-wallet path matches server behavior (fill focus from pool up to tier cap).
- `renderFocusStrip` shows the pool: `Pool: N` alongside the focus progress.
  When no focus is set, show `Pool: N` with a hint like "Choose a focus to
  spend fragments".
- Any client copy that said fragments were converted to coins is updated.

## Client Types / UI (`src/hooks/useDailySpin.ts`)

- `fragmentsOverflowed` / `fallbackCoins` fields → `fragmentsPooled`.
- Spin result copy: when fragments go to the pool, say so ("+3 Fragments →
  Pool") instead of implying a coin conversion.

## Migration

None. The economy update just shipped; no meaningful number of players hold
fragments yet. New fields default cleanly via `normalizeShopData` for any
existing records (`pooledFragments: 0`, `poolAppliedFragments: {}`).

## Testing

Unit (core.ts, rewards.ts):
- Award with no focus → all to pool, coins unchanged.
- Award with focus not full → fills focus, overflow to pool, coins unchanged.
- Award with focus full → all to pool.
- `setFocus` on common/rare/epic → pool drains up to 100% of requirement,
  remainder stays pooled.
- `setFocus` on legendary → pool drains to at most 50% of requirement.
- Legendary cap is cumulative: focus → unfocus → focus does not re-drain past
  the cap.
- Craft still succeeds only when `fragments[itemId] >= requirement`.

Integration:
- `POST /api/spin` returning a fragment prize with no focus → response shop has
  increased `pooledFragments`, coins unchanged, prize reports `fragmentsPooled`.
- Check-in claim fragment reward with no focus → same.

Manual (preview): spin a fragment prize with no focus, confirm the focus strip
shows `Pool: N` and no phantom coin gain; then set a focus and confirm the pool
pours in (capped for legendary).

## Out of Scope

- Manual "spend pool" UI beyond the automatic drain on focus-set.
- Changing spin odds / reward weights.
- Any onchain representation of fragments.
