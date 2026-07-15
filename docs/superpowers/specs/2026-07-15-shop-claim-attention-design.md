# Shop claim attention design

## Goal

Make an owned but unclaimed NFT easier to notice in the Shop without changing
the visual hierarchy of the Shop's action buttons.

## Approved behavior

- Skin and trail cards that need an NFT claim show a compact blue `CLAIM`
  button. It keeps the current shared claim styling, while returning to the
  Shop-specific compact footprint used before the label was `CLAIM ONCHAIN`.
- The inline message beneath the item description remains `Claim NFT to
  unlock`. It receives a dedicated class and a slow, soft gold glow animation
  to draw attention to the pending unlock.
- The glow is present only while an item needs a claim. It does not apply to
  Buy, Equip, Daily Check-in, Quests, Starter Pack, claimed items, or a button
  whose claim is in progress.
- `prefers-reduced-motion: reduce` disables the hint animation.

## Implementation boundaries

- Update the two Shop render paths in `public/game/game.js` (skins and
  trails) so their matching button labels and hint markup remain identical.
- Add narrowly-scoped Shop CSS in `src/app/globals.css`: compact sizing for
  the two claim button variants, the gold hint animation, and the reduced
  motion fallback.
- Extend the existing runner-hub regression script to check both render paths
  use `CLAIM` and the dedicated hint class, and that the CSS keeps the
  animation scoped to the Shop hint.

## Verification

1. Run the focused runner-hub and claim-navigation regression scripts.
2. Run `git diff --check`.
3. Run the production build.
