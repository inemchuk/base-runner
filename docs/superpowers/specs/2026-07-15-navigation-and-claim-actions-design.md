# Navigation and Claim Actions Design

## Goal

Make movement through Base Runner predictable on a phone and make every reward-claim action feel like part of one visual system.

The player must be able to leave a long Runner Hub section without returning to the top of its scroll. A `CLAIM` action must look the same wherever it appears, including the onchain score claim.

## Information architecture

The game has three navigation contexts.

| Context | Screens | Navigation rule |
| --- | --- | --- |
| Runner Hub | Home, Shop, Quests, Leaders, Profile | Five fixed bottom destinations are lateral navigation between equal sections. |
| Run flow | Loadout, gameplay, Continue, Run Complete | The hub navigation is hidden. Each screen exposes only the actions that advance, resume, or exit the run. |
| Focused reward/settings flow | Daily Check-in, Daily Spin, Starter Pack, Settings, Level Rewards | The screen or overlay keeps its current focused action and a clearly labelled way to leave or return to its origin. |

The existing five Runner Hub destinations and order remain unchanged: Shop, Quests, Play, Leaders, Profile. Play continues to open Loadout. The current destination remains visibly active in the fixed bottom navigation.

## Long Hub screens

Shop, Quests, Leaders, and Profile receive one shared sticky header inside their own scroll container.

```
← HOME        SECTION TITLE             context
```

- `← HOME` always returns to the Home/Menu screen and is available at every scroll position.
- The centre is the current screen title: `SHOP`, `QUESTS`, `LEADERS`, or `PROFILE`.
- The right side is reserved for screen-specific context: coin balance in Shop, `LIVE` in Quests, level/Base ID in Profile, and the current leaderboard context in Leaders.
- The header is opaque deep navy with a subtle bottom border and shadow while content passes underneath. It must not use a costly continuous blur effect.
- It respects the top safe area, has a minimum 44 px touch target for `← HOME`, and layers below modal dialogs but above list content.
- The fixed Runner Hub navigation remains visible at the bottom. Scroll bodies keep bottom clearance so their final card is never hidden behind it.
- Changing Hub destinations preserves each destination's scroll position during the session. Returning to Home shows Home from its initial position.

No sticky Hub header is added to gameplay, Loadout, Run Complete, Continue, Daily Check-in, Daily Spin, Starter Pack, or Settings in this pass. Those screens retain their focused-flow controls. Settings continues to return to the screen from which it was opened.

## Claim action system

All reward claims use the same blue primary action treatment. The treatment uses the existing Base-blue primary button language: filled `#0052FF` surface, white uppercase label, shared corner radius, border, shadow, touch feedback, focus ring, height, and disabled/loading geometry.

| Situation | Label | Presentation |
| --- | --- | --- |
| Quest reward | `CLAIM` | Shared blue claim button within the quest card. |
| Daily Check-in | `CLAIM` plus earned-reward chips | Shared blue claim button; keeps the reward chips already needed for the check-in context. |
| Starter Pack | `CLAIM FREE` | Shared blue claim button, full-width inside the pack overlay. |
| Shop NFT asset | `CLAIM ONCHAIN` | Same blue claim button, with explicit onchain wording. |
| Run Complete score | `CLAIM ONCHAIN` | Same blue claim button, with explicit onchain wording. |
| Daily Spin NFT reward | `CLAIM ONCHAIN` | Same blue claim button in the prize flow. |
| Level-up NFT reward | `CLAIM ONCHAIN` | Same blue claim button in the level-up flow. |

The Daily Chest in Shop is a coin purchase, not a claim. Its price and purchase treatment remain gold because it spends a visible currency rather than granting an already-earned reward.

`ONCHAIN` is a label, not a separate visual category: a player is still collecting a reward. Wallet requirements are communicated by the button state rather than a different colour.

- No connected wallet: `CONNECT WALLET TO CLAIM` in the same button geometry.
- Pending request: `CLAIMING…`; the button does not resize and rejects repeated taps.
- Completed reward: replace the button with the mint `✓ CLAIMED` status, not a disabled action.
- Unavailable rewards do not masquerade as actionable claims.

Gold remains reserved for the value being received or spent: coin prices, reward chips, rare/owned states, and reward-card accents. It is not the primary colour of a Claim button.

## Interaction consistency

- Bottom navigation changes destination; it is never used as a Back control.
- `← HOME` exits a Hub destination to Home. `MENU` exits a run flow to Home/Menu. `BACK` is reserved for returning to an immediate parent only when that parent matters.
- Each action has one visible semantic result: blue moves the player forward or collects a reward, gold describes value, mint confirms completion, and subdued navy is secondary or dismissive.
- Keyboard focus remains visible on every header and action button. Reduced-motion preferences continue to remove nonessential transitions.

## Scope and non-goals

This design changes the four long Hub screens and normalizes all Claim treatments. It does not change economy authority, wallet or transaction logic, reward amounts, current Run Complete idempotency, or the five-destination Hub model. It also does not redesign unrelated buy, craft, equip, or settings controls in this pass.

## Verification

- Static UI checks verify that each of the four long Hub screens has the shared sticky header structure and that it remains inside the correct scroll container.
- Runtime checks verify Hub navigation preserves scroll position and `← HOME` returns to Home from every long Hub screen.
- UI checks verify every Claim source uses the shared claim class/style, that onchain wording remains explicit, and that pending/completed states do not allow duplicate claim actions.
- Responsive review covers 320 px wide and short mobile viewports, safe areas, final-card clearance above the Hub nav, keyboard focus, and reduced motion.
- Existing run-complete runtime/UI checks, JavaScript syntax checks, ESLint, TypeScript/build, and the production build remain green.
