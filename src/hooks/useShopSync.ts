'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

export function useShopSync() {
  const { address } = useAccount();

  const syncShop = useCallback(async (
    owned:      string[],
    equipped:   string,
    boosters?:  string[],
    trailPacks?: string[],
  ) => {
    if (!address) return;
    try {
      await fetch('/api/shop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, owned, equipped, boosters: boosters ?? [], trailPacks: trailPacks ?? [] }),
      });
    } catch (err) {
      console.error('shop sync error:', err);
    }
  }, [address]);

  const loadShop = useCallback(async () => {
    if (!address) return;
    try {
      const res  = await fetch(`/api/shop?address=${address}`);
      const data = await res.json();
      if (data.owned && data.equipped) {
        const applyFn = (window as any).Shop?.applyServerData;
        if (applyFn) applyFn(data.owned, data.equipped, data.boosters ?? [], data.trailPacks ?? []);
      }
    } catch (err) {
      console.error('shop load error:', err);
    }
  }, [address]);

  useEffect(() => {
    (window as any).__BASE_SHOP_SYNC = syncShop;
    const timer = setTimeout(() => loadShop(), 1500);
    return () => {
      delete (window as any).__BASE_SHOP_SYNC;
      clearTimeout(timer);
    };
  }, [syncShop, loadShop]);

  return { syncShop, loadShop };
}
