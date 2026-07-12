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
    // Notify game.js so the claim button can show a "Confirming" state while the
    // tx is sending / being mined (matches the check-in / mint transaction UX).
    window.dispatchEvent(new CustomEvent('base-score-claim-state', { detail: { isPending } }));
    return () => {
      delete w.__BASE_CLAIM_SCORE;
      delete w.__BASE_SCORE_CLAIM_STATE;
    };
  }, [claim, isPending]);

  return { claim, isPending };
}
