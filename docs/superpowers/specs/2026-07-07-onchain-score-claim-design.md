# Onchain Score Claim — Design

Date: 2026-07-07
Status: Approved (design)

## Goal

Add a button on the game-over screen that lets the player "claim" the score
they just achieved onchain. Tapping it fires a gasless (paymaster-sponsored)
transaction on Base. This is purely an extra onchain-activity touchpoint — the
real leaderboard stays off-chain in Redis. No gameplay or reward logic depends
on it.

## Non-Goals

- No anti-cheat / server signature. Anyone can claim any score. Acceptable
  because nothing of value is gated on it.
- No change to the existing off-chain score submit / leaderboard flow.
- No on-chain storage of scores or leaderboard (event-only).

## Architecture

Mirrors the existing check-in feature end-to-end (contract → config → hook →
`window` bridge → game.js UI).

### 1. Contract — `contracts/BaseRunnerScoreClaim.sol`

Minimal, stores nothing:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BaseRunnerScoreClaim {
    uint256 public constant MAX_SCORE = 1_000_000;

    event ScoreClaimed(address indexed player, uint256 score);

    function claimScore(uint256 score) external {
        require(score > 0 && score <= MAX_SCORE, "Invalid score");
        emit ScoreClaimed(msg.sender, score);
    }
}
```

Deployed manually on Base mainnet (same path as `BaseRunnerCheckIn`, e.g.
Remix). The resulting address is hardcoded into config. **Deployment is a user
step**; the frontend ships with a placeholder address until provided.

### 2. Config — `src/config/scoreclaim-contract.ts`

Exports `SCORECLAIM_ADDRESS` and `SCORECLAIM_ABI` (the `claimScore` function
and `ScoreClaimed` event), following `checkin-contract.ts`.

### 3. Hook — `src/hooks/useScoreClaim.ts`

Copy of the `useCheckIn` transaction pattern:

- Gasless first: `wallet_sendCalls` with `capabilities.paymasterService.url =
  PAYMASTER_URL`, encoding `claimScore(score)` and appending the shared
  `DATA_SUFFIX` (ox `Attribution`). Poll `wallet_getCallsStatus` until
  confirmed/failed (max 90s), same timing as check-in.
- Fallback: regular `writeContract({ functionName: 'claimScore', args: [score] })`
  (user pays gas) when `wallet_sendCalls` is unsupported or the paymaster
  rejects.
- Chain guard: `switchChainAsync({ chainId: base.id })` if needed.
- No on-chain read (event-only contract), so no `useReadContract`.

Exposes on `window`:

- `window.__BASE_CLAIM_SCORE(score: number) => Promise<void>` — starts the tx.
- `window.__BASE_SCORE_CLAIM_STATE = { isPending: boolean }`.

On confirmation, dispatch `window.dispatchEvent(new CustomEvent('base-score-claimed'))`
so game.js can flip the button to its success state (same convention as
`base-checkin-confirmed`).

### 4. React shell — `src/components/Game.tsx`

- Mount `useScoreClaim()` alongside the other bridge hooks.
- Add a button to `#screen-gameover`, placed between the stats rows and
  `PLAY AGAIN`:

  ```html
  <button className="btn btn-claim-score" id="btn-claim-score"
          style={{display:'none'}}>⛓ CLAIM ONCHAIN</button>
  ```

  Hidden by default; game.js decides visibility.

### 5. Game engine — `public/game/game.js` (`showGameOver`)

When showing the game-over screen:

- Look up `btn-claim-score`. Show it only if `window.__BASE_WALLET` is set
  (wallet connected) **and** `score > 0`; otherwise `display:none`.
- Reset the button to idle each time the screen is shown:
  label `⛓ CLAIM ONCHAIN`, enabled.
- `onclick`:
  - Set button to pending: label `CLAIMING…`, disabled.
  - Call `window.__BASE_CLAIM_SCORE(score)`.
  - On `base-score-claimed` event: label `CLAIMED ✓`, stays disabled for this
    game-over screen (prevents spam within one death).
  - If `__BASE_CLAIM_SCORE` throws / rejects: revert to idle (enabled) so the
    player can retry.
- Bind the click handler once (guard against double-binding across screen
  shows), and capture the current `score` in the handler closure / dataset.

## Data Flow

```
death → showGameOver(score) → [wallet connected & score>0?] → show button
  → tap → window.__BASE_CLAIM_SCORE(score)
       → hook: wallet_sendCalls (paymaster) | fallback writeContract
       → confirmed → dispatch 'base-score-claimed'
  → button → CLAIMED ✓ (disabled)
```

## Error Handling

- No wallet: button never appears; normal flow unaffected.
- Wrong chain: hook switches to Base before sending.
- Paymaster/`wallet_sendCalls` unsupported: fallback to user-paid tx.
- Tx failed / rejected / poll timeout: button returns to idle (enabled) for
  retry; no error is fatal to the game-over screen.
- Missing config address (not yet deployed): `__BASE_CLAIM_SCORE` is a no-op /
  logs; button still renders but claim does nothing. (Ship-safe placeholder.)

## Testing / Verification

- Lint + build pass.
- Manual: on game over with a connected wallet and score > 0, the button
  appears; tapping fires the paymaster tx; on confirm it shows `CLAIMED ✓`.
  With no wallet the button is absent. `PLAY AGAIN` / `MENU` still work.
- Off-chain score submit and leaderboard are unchanged.

## Files Touched

- `contracts/BaseRunnerScoreClaim.sol` (new)
- `src/config/scoreclaim-contract.ts` (new)
- `src/hooks/useScoreClaim.ts` (new)
- `src/components/Game.tsx` (mount hook + button markup)
- `public/game/game.js` (`showGameOver` button wiring)
