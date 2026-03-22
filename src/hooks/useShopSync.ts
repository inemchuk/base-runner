'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

export function useShopSync() {
  const { address } = useAccount();

  // Sync shop data to server
  const syncShop = useCallback(async (owned: string[], equipped: string, boosters?: string[]) => {
    if (!address) return;
    try {
      await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, owned, equipped, boosters: boosters || [] }),
      });
    } catch (err) {
      console.error('shop sync error:', err);
    }
  }, [address]);

  // Load shop data from server on mount
  const loadShop = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/shop?address=${address}`);
      const data = await res.json();
      if (data.owned && data.equipped) {
        const applyFn = (window as any).Shop?.applyServerData;
        if (applyFn) applyFn(data.owned, data.equipped, data.boosters || []);
      }
    } catch (err) {
      console.error('shop load error:', err);
    }
  }, [address]);

  useEffect(() => {
    (window as any).__BASE_SHOP_SYNC = syncShop;

    // Load from server after a short delay (wait for game.js to init)
    const timer = setTimeout(() => loadShop(), 1500);

    return () => {
      delete (window as any).__BASE_SHOP_SYNC;
      clearTimeout(timer);
    };
  }, [syncShop, loadShop]);

  return { syncShop, loadShop };
}
