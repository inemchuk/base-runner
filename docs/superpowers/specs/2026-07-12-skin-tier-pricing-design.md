# Skin Tier and Pricing Design

## Goal

Make skin rarity, price, and acquisition rules feel intentional. A player's
job or uniform must not appear in the Legendary tier solely because of an
arbitrary coin price. Rarity should communicate in-game status, crypto/Base
significance, and scarcity.

## Approved Skin Catalog

| Tier | Skin | Direct price | Craft requirement |
| --- | --- | ---: | --- |
| Starter | Genesis Runner | Free | None |
| Common | City Runner | 150 coins | 10 fragments + 40 coins |
| Rare | Base Builder | 750 coins | 20 fragments + 100 coins |
| Rare | Night Operator | 750 coins | 20 fragments + 100 coins |
| Rare | Doctor | 800 coins | 20 fragments + 100 coins |
| Rare | Firefighter | 850 coins | 20 fragments + 100 coins |
| Rare | Police Officer | 900 coins | 20 fragments + 100 coins |
| Epic | Justin Sun | 1,200 coins | 35 fragments + 300 coins |
| Epic | Anatoly Yakovenko | 1,300 coins | 35 fragments + 300 coins |
| Epic | Bitcoin Maxi | 1,350 coins | 35 fragments + 300 coins |
| Epic | Satoshi Nakamoto | 1,400 coins | 35 fragments + 300 coins |
| Epic | Ape Holder | 1,500 coins | 35 fragments + 300 coins |
| Legendary | Brian Armstrong | Unavailable | 60 fragments + 500 coins |
| Legendary | Vitalik Buterin | Unavailable | 60 fragments + 500 coins |
| Legendary | Base King | Unavailable | 60 fragments + 500 coins |

`skin_1` remains retired and is intentionally outside the catalog.

## Rules

- Legendary skins cannot be bought directly with coins. Their only acquisition
  route is 60 fragments plus a 500-coin craft fee.
- The 300-coin Epic craft fee applies only to Epic skins. Existing Epic trail
  and death-effect fees remain unchanged at 220 coins.
- Common, Rare, and Epic skins retain a direct-buy option as an alternative to
  crafting.
- Level 20 grants `+150 coins +20 fragments`; it must not directly unlock
  Vitalik or any other Legendary skin.
- Existing ownership, equipped skins, fragments, and past purchases remain
  valid. The change must never revoke an owned item or issue a retroactive
  debit/refund.

## Implementation Boundary

The canvas shop currently owns a local item catalog while server/economy code
has a second catalog. The implementation must make the values above canonical
for both paths, so a skin never has a different tier, price, or acquisition
method depending on whether local or synced state is shown.

An item-level craft-fee override is required for Epic skins; changing the
global Epic tier fee would incorrectly reprice Epic trails and death effects.

## Verification

- Every active skin has exactly one tier and one acquisition rule.
- Legendary skins render a craft action, never a coin purchase action.
- Epic skin crafting consumes 35 fragments and 300 coins.
- Epic non-skin cosmetics continue to consume 35 fragments and 220 coins.
- The local canvas catalog and economy/server catalog agree on all active skin
  tiers and direct prices.
- Server and canvas level-20 rewards agree on `+150 coins +20 fragments`.
