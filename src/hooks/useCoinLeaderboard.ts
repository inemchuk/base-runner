'use client';

import { useEffect, useCallback } from 'react';

export function useCoinLeaderboard() {
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/coins/leaderboard');
      const data = await res.json();
      (window as any).__BASE_COIN_LB_ENTRIES = data.entries || [];
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
