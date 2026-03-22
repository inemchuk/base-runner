'use client';

import { useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';

export function useCoinClaim() {
  const { address } = useAccount();

  const syncCoins = useCallback(async (balance: number) => {
    if (!address) return;
    try {
      await fetch('/api/coins/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, balance }),
      });
    } catch (err) {
      console.error('coin sync error:', err);
    }
  }, [address]);

  const claim = useCallback(async (amount: number) => {
    if (!address || amount <= 0) return;
    try {
      // game.js already added coins to Save during gameplay
      // Just sync the total balance to Redis
      const totalCoins = (window as any).Save?.getCoins?.() ?? 0;
      await syncCoins(totalCoins);
      // Instant confirmation
      window.dispatchEvent(new CustomEvent('base-coins-claimed'));
    } catch (err) {
      console.error('coin claim error:', err);
    }
  }, [address, syncCoins]);

  useEffect(() => {
    (window as any).__BASE_CLAIM_COINS = claim;
    (window as any).__BASE_COIN_CLAIM = { isPending: false };
    (window as any).__BASE_SYNC_COINS = syncCoins;
    return () => {
      delete (window as any).__BASE_CLAIM_COINS;
      delete (window as any).__BASE_COIN_CLAIM;
      delete (window as any).__BASE_SYNC_COINS;
    };
  }, [claim, syncCoins]);

  return { claim };
}
