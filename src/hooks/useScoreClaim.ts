'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { encodeFunctionData, numberToHex } from 'viem';
import { Attribution } from 'ox/erc8021';
import { SCORECLAIM_ABI, SCORECLAIM_ADDRESS } from '@/config/scoreclaim-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

type WalletRequestClient = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

type ClaimIdentity = {
  runId: number;
  score: number;
};

type ScoreClaimWindow = Window & {
  __BASE_CLAIM_SCORE?: (runId: number, score: number) => Promise<void>;
  __BASE_SCORE_CLAIM_STATE?: {
    isPending: boolean;
    runId?: number;
    score?: number;
  };
};

function sameClaim(a: ClaimIdentity | null, b: ClaimIdentity): boolean {
  return Boolean(a && a.runId === b.runId && a.score === b.score);
}

function dispatchClaimState(identity: ClaimIdentity, state: 'confirming' | 'idle') {
  window.dispatchEvent(new CustomEvent('base-score-claim-state', {
    detail: { ...identity, state },
  }));
}

function dispatchClaimed(identity: ClaimIdentity) {
  window.dispatchEvent(new CustomEvent('base-score-claimed', {
    detail: { ...identity },
  }));
}

export function useScoreClaim() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeClaimRef = useRef<ClaimIdentity | null>(null);
  const [paymasterPending, setPaymasterPending] = useState(false);

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    isError: isWriteError,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  const clearMatchingClaim = useCallback((identity: ClaimIdentity) => {
    if (sameClaim(activeClaimRef.current, identity)) {
      activeClaimRef.current = null;
    }
  }, []);

  const failClaim = useCallback((identity: ClaimIdentity) => {
    dispatchClaimState(identity, 'idle');
    clearMatchingClaim(identity);
  }, [clearMatchingClaim]);

  // Confirm a regular user-paid transaction with the identity captured when
  // the write began, not whichever result card happens to be visible now.
  useEffect(() => {
    if (!isSuccess) return;
    const identity = activeClaimRef.current;
    if (!identity) return;
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
    dispatchClaimed(identity);
    clearMatchingClaim(identity);
  }, [isSuccess, clearMatchingClaim]);

  // Wallet rejection, write failure, or reverted receipt restores retry for
  // the same run and score only.
  useEffect(() => {
    if (!isWriteError && !isReceiptError) return;
    const identity = activeClaimRef.current;
    if (!identity) return;
    failClaim(identity);
  }, [isWriteError, isReceiptError, failClaim]);

  const isPending = isWritePending || isConfirming || paymasterPending;

  const claim = useCallback(async (runId: number, score: number) => {
    if (!address) throw new Error('wallet_not_connected');
    if (!Number.isSafeInteger(runId) || runId <= 0) throw new RangeError('invalid_run_id');
    if (!Number.isFinite(score) || score <= 0) throw new RangeError('invalid_score');
    if (activeClaimRef.current) throw new Error('score_claim_in_progress');

    const identity = { runId, score: Math.floor(score) };
    activeClaimRef.current = identity;
    const scoreBig = BigInt(identity.score);

    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }

      // Try gasless via Paymaster (only if wallet supports wallet_sendCalls).
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
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            setPaymasterPending(false);
            setTimeout(() => {
              dispatchClaimed(identity);
              clearMatchingClaim(identity);
            }, 100);
          };
          const fail = () => {
            if (settled) return;
            settled = true;
            setPaymasterPending(false);
            failClaim(identity);
          };
          const iv = setInterval(async () => {
            elapsed += 2000;
            try {
              const res = await rpcClient.request({
                method: 'wallet_getCallsStatus',
                params: [callsId],
              }) as { status: number | string };
              const status = res?.status;
              const confirmed = status === 200 || status === 'CONFIRMED' || status === 'confirmed';
              const failed = status === 400 || status === 'FAILED' || status === 'failed';
              if (confirmed || failed || elapsed >= 90000) {
                clearInterval(iv);
                if (timeoutRef.current === iv) timeoutRef.current = null;
                if (confirmed || elapsed >= 90000) finish();
                else fail();
              }
            } catch {
              pollFails += 1;
              if (pollFails >= 5 || elapsed >= 15000) {
                clearInterval(iv);
                if (timeoutRef.current === iv) timeoutRef.current = null;
                finish();
              }
            }
          }, 2000);
          timeoutRef.current = iv;
          return;
        } catch {
          setPaymasterPending(false);
          // Paymaster unavailable: preserve the existing regular-tx fallback.
        }
      }

      writeContract({
        address: SCORECLAIM_ADDRESS,
        abi: SCORECLAIM_ABI,
        functionName: 'claimScore',
        args: [scoreBig],
        dataSuffix: DATA_SUFFIX,
      });
    } catch (error) {
      failClaim(identity);
      throw error;
    }
  }, [address, walletClient, chainId, switchChainAsync, writeContract, clearMatchingClaim, failClaim]);

  // Expose the scoped bridge to game.js. Pending events are sent only while a
  // concrete claim owns the transaction; idle is emitted explicitly on error.
  useEffect(() => {
    const w = window as ScoreClaimWindow;
    const identity = activeClaimRef.current;
    w.__BASE_CLAIM_SCORE = claim;
    w.__BASE_SCORE_CLAIM_STATE = identity
      ? { isPending, ...identity }
      : { isPending };
    if (identity && isPending) dispatchClaimState(identity, 'confirming');

    return () => {
      if (w.__BASE_CLAIM_SCORE === claim) {
        delete w.__BASE_CLAIM_SCORE;
        delete w.__BASE_SCORE_CLAIM_STATE;
      }
    };
  }, [claim, isPending]);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { claim, isPending };
}
