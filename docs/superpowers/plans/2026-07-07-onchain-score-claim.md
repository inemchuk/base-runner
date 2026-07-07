# Onchain Score Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a game-over button that fires a gasless (paymaster) Base transaction emitting the player's run score onchain.

**Architecture:** Mirror the existing check-in feature: deployed `BaseRunnerScoreClaim` contract → config module → React hook (`useScoreClaim`) that exposes a `window.__BASE_CLAIM_SCORE(score)` bridge and dispatches a `base-score-claimed` event → `Game.tsx` mounts the hook and renders a hidden button → `game.js` wires the button in `showGameOver` and drives its idle/pending/success states.

**Tech Stack:** Next.js 16 / React 19, wagmi 3 + viem 2, `ox/erc8021` Attribution, Base paymaster via `wallet_sendCalls`, vanilla `public/game/game.js`.

**Note on testing:** This repo has no unit-test runner for React hooks or `game.js` (only `node scripts/verify-*.mjs` and lint/build). Verification here is `npm run lint`, `npm run build`, and a preview smoke test — matching how the rest of the frontend is validated. There is no jest/vitest to add TDD tests to.

**Deployed contract:** `BaseRunnerScoreClaim` is deployed & Sourcify-verified on Base at `0x2874FF67fEA4E9fE3dfa2bcD0010eE577D63B7e2`. Use this address in Task 1. (The hook still no-ops on the zero address as a defensive guard.)

---

### Task 1: Contract config module

**Files:**
- Create: `src/config/scoreclaim-contract.ts`

- [ ] **Step 1: Create the config module**

Model it on `src/config/checkin-contract.ts`.

```ts
// Contract address — BaseRunnerScoreClaim, deployed on Base mainnet.
export const SCORECLAIM_ADDRESS = '0x2874FF67fEA4E9fE3dfa2bcD0010eE577D63B7e2' as const;

export const SCORECLAIM_ABI = [
  {
    type: 'function',
    name: 'claimScore',
    inputs: [{ name: 'score', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'MAX_SCORE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ScoreClaimed',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'score', type: 'uint256', indexed: false },
    ],
  },
] as const;
```

- [ ] **Step 2: Typecheck the module**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `scoreclaim-contract.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/config/scoreclaim-contract.ts
git commit -m "feat(onchain): add score-claim contract config"
```

---

### Task 2: `useScoreClaim` hook

**Files:**
- Create: `src/hooks/useScoreClaim.ts`

This is a trimmed copy of `useCheckIn` — no `useReadContract` (event-only contract), the write takes a `score` argument, and it exposes a `window.__BASE_CLAIM_SCORE(score)` function plus a `window.__BASE_SCORE_CLAIM_STATE` object.

- [ ] **Step 1: Create the hook**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { encodeFunctionData, numberToHex } from 'viem';
import { Attribution } from 'ox/erc8021';
import { SCORECLAIM_ABI, SCORECLAIM_ADDRESS } from '@/config/scoreclaim-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;
const ZERO = '0x0000000000000000000000000000000000000000';

type WalletRequestClient = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

type ScoreClaimWindow = Window & {
  __BASE_CLAIM_SCORE?: (score: number) => Promise<void>;
  __BASE_SCORE_CLAIM_STATE?: { isPending: boolean };
};

export function useScoreClaim() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [paymasterPending, setPaymasterPending] = useState(false);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  // Confirm fallback (user-paid) tx
  useEffect(() => {
    if (isSuccess) {
      if (timeoutRef.current) clearInterval(timeoutRef.current);
      window.dispatchEvent(new CustomEvent('base-score-claimed'));
    }
  }, [isSuccess]);

  const isPending = isWritePending || isConfirming || paymasterPending;

  const claim = useCallback(async (score: number) => {
    if (!address) return;
    if (!SCORECLAIM_ADDRESS || SCORECLAIM_ADDRESS === ZERO) return; // not deployed yet — no-op
    if (!Number.isFinite(score) || score <= 0) return;
    const scoreBig = BigInt(Math.floor(score));

    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }

    // Try gasless via Paymaster (only if wallet supports wallet_sendCalls)
    if (PAYMASTER_URL && walletClient) {
      try {
        const rpcClient = walletClient as WalletRequestClient;
        const callData = encodeFunctionData({
          abi: SCORECLAIM_ABI,
          functionName: 'claimScore',
          args: [scoreBig],
        });

        setPaymasterPending(true);
        const callsId = await rpcClient.request({
          method: 'wallet_sendCalls',
          params: [{
            version: '1.0',
            chainId: numberToHex(base.id),
            from: address,
            calls: [{
              to: SCORECLAIM_ADDRESS,
              data: (callData + DATA_SUFFIX.slice(2)) as `0x${string}`,
            }],
            capabilities: {
              paymasterService: { url: PAYMASTER_URL },
            },
          }],
        }) as string;

        let elapsed = 0;
        let pollFails = 0;
        const finish = () => {
          setPaymasterPending(false);
          setTimeout(() => window.dispatchEvent(new CustomEvent('base-score-claimed')), 100);
        };
        const iv = setInterval(async () => {
          elapsed += 2000;
          try {
            const res = await rpcClient.request({
              method: 'wallet_getCallsStatus',
              params: [callsId],
            }) as { status: number | string };
            const s = res?.status;
            const confirmed = s === 200 || s === 'CONFIRMED' || s === 'confirmed';
            const failed    = s === 400 || s === 'FAILED'    || s === 'failed';
            if (confirmed || failed || elapsed >= 90000) {
              clearInterval(iv);
              if (confirmed || elapsed >= 90000) finish();
              else setPaymasterPending(false);
            }
          } catch {
            pollFails++;
            if (pollFails >= 5 || elapsed >= 15000) { clearInterval(iv); finish(); }
          }
        }, 2000);
        timeoutRef.current = iv;
        return;
      } catch {
        setPaymasterPending(false);
        // fall through to regular tx
      }
    }

    // Fallback: user-paid tx
    writeContract({
      address: SCORECLAIM_ADDRESS,
      abi: SCORECLAIM_ABI,
      functionName: 'claimScore',
      args: [scoreBig],
      dataSuffix: DATA_SUFFIX,
    });
  }, [address, walletClient, chainId, switchChainAsync, writeContract]);

  // Expose to game.js via window
  useEffect(() => {
    const w = window as ScoreClaimWindow;
    w.__BASE_CLAIM_SCORE = claim;
    w.__BASE_SCORE_CLAIM_STATE = { isPending };
    return () => {
      delete w.__BASE_CLAIM_SCORE;
      delete w.__BASE_SCORE_CLAIM_STATE;
    };
  }, [claim, isPending]);

  return { claim, isPending };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `useScoreClaim.ts`. (If `dataSuffix` typing complains, confirm it matches the exact usage in `useCheckIn.ts` — it is the same call shape.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScoreClaim.ts
git commit -m "feat(onchain): add useScoreClaim paymaster hook"
```

---

### Task 3: Mount hook + render button in `Game.tsx`

**Files:**
- Modify: `src/components/Game.tsx` (imports ~line 5-13; hook mounts ~line 24-31; gameover screen ~line 382-403)

- [ ] **Step 1: Import the hook**

Add after the `useNftMint` import (line 12):

```tsx
import { useNftMint } from '@/hooks/useNftMint';
import { useScoreClaim } from '@/hooks/useScoreClaim';
```

- [ ] **Step 2: Mount the hook**

Add alongside the other hook calls (near line 31, after `useNftMint();`):

```tsx
  useNftMint();
  useScoreClaim();
```

- [ ] **Step 3: Add the button to the game-over screen**

In `#screen-gameover`, insert the claim button between the quest-notify `<p>` (currently line 401) and the `btn-restart` button (line 402):

```tsx
        <p id="go-quest-notify" className="quest-notify" style={{display:'none'}}><img className="quest-notify-icon ui-icon" src="/game/ui-icons/quests.png" alt="" aria-hidden="true" />Quest complete! Tap to claim</p>
        <button className="btn btn-claim-score" id="btn-claim-score" style={{display:'none'}}>⛓ CLAIM ONCHAIN</button>
        <button className="btn btn-restart" id="btn-restart">↺ PLAY AGAIN</button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Game.tsx
git commit -m "feat(onchain): mount score-claim hook and game-over button"
```

---

### Task 4: Wire the button in `game.js`

**Files:**
- Modify: `public/game/game.js` — `showGameOver` (~line 5589-5645); startup bindings (~line 9959, near `btn-restart`)

The button lives on the game-over screen. We (a) reset & show/hide it each time `showGameOver` runs, (b) bind its click once at startup, and (c) listen once for `base-score-claimed` to flip it to the success state. The current run's score is stored on the button's dataset so the click handler and the confirm listener stay in sync.

- [ ] **Step 1: Add button reset logic in `showGameOver`**

Insert just before the final `show('gameover');` line (currently line 5644):

```js
    // Onchain score-claim button — visible only with a connected wallet & real score
    const claimScoreBtn = document.getElementById('btn-claim-score');
    if (claimScoreBtn) {
      const canClaim = Boolean(window.__BASE_WALLET) && score > 0;
      claimScoreBtn.style.display = canClaim ? '' : 'none';
      if (canClaim) {
        claimScoreBtn.dataset.score = String(score);
        claimScoreBtn.dataset.claimed = '';
        claimScoreBtn.disabled = false;
        claimScoreBtn.style.opacity = '1';
        claimScoreBtn.textContent = '⛓ CLAIM ONCHAIN';
      }
    }

    show('gameover');
```

- [ ] **Step 2: Bind the click handler at startup**

Next to the existing `_bind('btn-restart', ...)` (line 9959), add:

```js
  _bind('btn-restart', 'click', () => Loadout.show());
  _bind('btn-claim-score', 'click', () => {
    const btn = document.getElementById('btn-claim-score');
    if (!btn || btn.disabled || btn.dataset.claimed === '1') return;
    const score = parseInt(btn.dataset.score || '0', 10);
    if (!score || typeof window.__BASE_CLAIM_SCORE !== 'function') return;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.textContent = '⏳ CLAIMING…';
    Promise.resolve(window.__BASE_CLAIM_SCORE(score)).catch(() => {
      // send failed to even start — revert to idle so the player can retry
      if (btn.dataset.claimed === '1') return;
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '⛓ CLAIM ONCHAIN';
    });
  });
```

- [ ] **Step 3: Listen once for confirmation**

Near the other global listeners (e.g. after the `base-leaderboard-loaded` listener at line 428), add:

```js
  window.addEventListener('base-score-claimed', () => {
    const btn = document.getElementById('btn-claim-score');
    if (!btn) return;
    btn.dataset.claimed = '1';
    btn.disabled = true;
    btn.style.opacity = '1';
    btn.textContent = '✓ CLAIMED';
  });
```

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "feat(onchain): wire game-over score-claim button"
```

---

### Task 5: Style the button

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Find the existing game-over button styles**

Run: `grep -n "btn-restart\|btn-back\|\.btn " src/app/globals.css`
Expected: locate the `.btn`, `.btn-restart`, `.btn-back` rules that style the game-over buttons.

- [ ] **Step 2: Add a `.btn-claim-score` rule**

Match the visual weight of the other game-over buttons but give it an onchain accent (Base blue). Place it near the `.btn-restart` rule found in Step 1:

```css
.btn-claim-score {
  background: #0052ff;
  color: #fff;
  border-color: #0052ff;
}
.btn-claim-score:disabled {
  cursor: default;
}
```

(If the existing `.btn` rules use different color/border conventions, follow those — the goal is a Base-blue claim button consistent with the surrounding buttons.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(onchain): style game-over score-claim button"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: passes with no new errors.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Preview smoke test**

Start the dev server and drive the preview:
- Play a run to death with a connected wallet → the `⛓ CLAIM ONCHAIN` button appears on the game-over screen.
- Tap it → button shows `⏳ CLAIMING…`, the wallet prompts (or paymaster sponsors) a `claimScore` tx on Base.
- On confirmation → button shows `✓ CLAIMED` and is disabled.
- Verify `PLAY AGAIN` and `MENU` still work.
- With no wallet connected → the button is absent and the game-over flow is unchanged.

Confirm via `preview_console_logs` (no errors) and `preview_screenshot` (button states).

- [ ] **Step 4: Confirm off-chain flow untouched**

Verify the normal score submit + leaderboard still behave as before (no code in those paths changed).

---

## Self-Review

- **Spec coverage:** contract (already deployed, saved in repo) ✓; config (Task 1) ✓; hook + `window.__BASE_CLAIM_SCORE` + `base-score-claimed` (Task 2) ✓; Game.tsx mount + button (Task 3) ✓; game.js visibility/pending/success wiring (Task 4) ✓; button hidden without wallet / score 0 ✓; gasless-with-fallback ✓; reton-retry on failure ✓; success-disables-for-this-death ✓.
- **Placeholder scan:** only intentional `<DEPLOYED_ADDRESS>` in Task 1, which the user supplies; hook no-ops on the zero address so the app is ship-safe until then.
- **Type consistency:** `window.__BASE_CLAIM_SCORE(score)` and `base-score-claimed` used identically across Tasks 2/3/4; `dataset.claimed === '1'` checked consistently in Task 4 Steps 2 & 3; `claimScore(uint256)` matches the deployed contract and the ABI in Task 1.
