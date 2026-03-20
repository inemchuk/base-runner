'use client';

import { useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { base } from 'wagmi/chains';
import { Attribution } from 'ox/erc8021';
import { getName } from '@coinbase/onchainkit/identity';
import { LEADERBOARD_ABI, LEADERBOARD_ADDRESS } from '@/config/leaderboard-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });

// Resolve address → Basename via OnchainKit (official Base name resolution)
async function resolveBasename(address: string): Promise<string> {
  try {
    const name = await getName({ address: address as `0x${string}`, chain: base });
    if (name) return name.replace('.base.eth', '.base');
  } catch {}
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function useLeaderboard() {
  const { address } = useAccount();

  const { data: entries, refetch } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: 'getLeaderboard',
  });

  const { data: myBest } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: 'bestScore',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  useEffect(() => {
    if (isSuccess) {
      refetch().then(() => {
        window.dispatchEvent(new CustomEvent('base-score-submitted'));
      });
    }
  }, [isSuccess, refetch]);

  const submit = (score: number) => {
    writeContract({
      address: LEADERBOARD_ADDRESS,
      abi: LEADERBOARD_ABI,
      functionName: 'submitScore',
      args: [BigInt(score)],
      dataSuffix: DATA_SUFFIX,
    });
  };

  // Expose to game.js via window
  useEffect(() => {
    (window as any).__BASE_LEADERBOARD = {
      myBest: myBest ? Number(myBest) : 0,
      isPending: isPending || isConfirming,
    };
    (window as any).__BASE_SUBMIT_SCORE = submit;

    // Resolve and expose leaderboard entries with names
    if (entries) {
      const validEntries = (entries as unknown as any[]).filter(
        (e) => e.player !== '0x0000000000000000000000000000000000000000'
      );

      Promise.all(
        validEntries.map(async (e, i) => {
          const name = await resolveBasename(e.player);
          return { rank: i + 1, name, score: Number(e.score), address: e.player };
        })
      ).then((resolved) => {
        (window as any).__BASE_LEADERBOARD_ENTRIES = resolved;
        window.dispatchEvent(new CustomEvent('base-leaderboard-loaded'));
      });
    }

    return () => {
      delete (window as any).__BASE_LEADERBOARD;
      delete (window as any).__BASE_SUBMIT_SCORE;
      delete (window as any).__BASE_LEADERBOARD_ENTRIES;
    };
  }, [entries, myBest, isPending, isConfirming]);

  return { entries, myBest, submit, isPending, isConfirming, isSuccess };
}
