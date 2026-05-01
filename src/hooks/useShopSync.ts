'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

interface ShopPayload {
  owned:          string[];
  equipped:       string;
  boosterCharges: Record<string, number>;
  trailPacks:     string[];
  equippedTrail:  string;
  equippedDeath:  string;
  deathPacks:     string[];
}

export function useShopSync() {
  const { address } = useAccount();

  // Called by game.js via window.__BASE_SHOP_SYNC whenever shop data changes
  const syncShop = useCallback(async (payload: ShopPayload) => {
    if (!address) return;
    try {
      await fetch('/api/shop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, ...payload }),
      });
    } catch (err) {
      console.error('shop sync error:', err);
    }
  }, [address]);

  // Called on wallet connect — load from Redis and hydrate game.js Shop
  const loadShop = useCallback(async () => {
    if (!address) return;
    try {
      const res  = await fetch(`/api/shop?address=${address}`);
      const data: ShopPayload = await res.json();
      const applyFn = (window as any).Shop?.applyServerData;
      if (applyFn) {
        applyFn(
          data.owned,
          data.equipped,
          data.boosterCharges ?? {},
          data.trailPacks,
          data.equippedTrail,
          data.equippedDeath,
          data.deathPacks,
        );
      }
    } catch (err) {
      console.error('shop load error:', err);
    }
  }, [address]);

  useEffect(() => {
    (window as any).__BASE_SHOP_SYNC = syncShop;
    // Load server data shortly after mount (give game.js time to init Shop)
    const timer = setTimeout(loadShop, 1500);
    return () => {
      delete (window as any).__BASE_SHOP_SYNC;
      clearTimeout(timer);
    };
  }, [syncShop, loadShop]);

  // Reload when wallet address changes
  useEffect(() => {
    if (address) {
      const timer = setTimeout(loadShop, 500);
      return () => clearTimeout(timer);
    }
  }, [address, loadShop]);

  return { syncShop, loadShop };
}
