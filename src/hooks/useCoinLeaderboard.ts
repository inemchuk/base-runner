'use client';

import { useEffect, useCallback } from 'react';
import { base } from 'wagmi/chains';
import { createPublicClient, http } from 'viem';
import { COIN_CONTRACT_ADDRESS, COIN_CONTRACT_ABI } from '@/config/coin-contract';
import { resolveBasenames } from '@/lib/resolveBasename';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

export function useCoinLeaderboard() {
  const fetchLeaderboard = useCallback(async () => {
    try {
      const entries = await publicClient.readContract({
        address: COIN_CONTRACT_ADDRESS,
        abi: COIN_CONTRACT_ABI,
        functionName: 'getLeaderboard',
      }) as Array<{ player: `0x${string}`; amount: bigint }>;

      const filtered = entries.filter(e => e.player !== '0x0000000000000000000000000000000000000000');
      const addresses = filtered.map(e => e.player);
      const names = await resolveBasenames(addresses);

      const resolved = filtered.map((e, i) => ({
        rank: i + 1,
        name: names.get(e.player.toLowerCase()) ?? `${e.player.slice(0, 6)}…${e.player.slice(-4)}`,
        balance: Number(e.amount),
        address: e.player,
      }));

      (window as any).__BASE_COIN_LB_ENTRIES = resolved;
      window.dispatchEvent(new CustomEvent('base-coin-lb-loaded'));
    } catch (err) {
      console.error('coin leaderboard fetch error:', err);
    }
  }, []);

  useEffect(() => {
    (window as any).__BASE_FETCH_COIN_LB = fetchLeaderboard;
    return () => {
      delete (window as any).__BASE_FETCH_COIN_LB;
    };
  }, [fetchLeaderboard]);

  return { fetchLeaderboard };
}
