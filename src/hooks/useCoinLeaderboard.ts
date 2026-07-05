'use client';

import { useEffect, useCallback } from 'react';

type CoinLeaderboardEntry = Record<string, unknown>;

type CoinLeaderboardResponse = {
  entries?: CoinLeaderboardEntry[];
};

type CoinLeaderboardWindow = Window & {
  __BASE_COIN_LB_ENTRIES?: CoinLeaderboardEntry[];
  __BASE_FETCH_COIN_LB?: () => Promise<void>;
};

export function useCoinLeaderboard() {
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/coins/leaderboard');
      const data = await res.json() as CoinLeaderboardResponse;
      (window as CoinLeaderboardWindow).__BASE_COIN_LB_ENTRIES = data.entries || [];
      window.dispatchEvent(new CustomEvent('base-coin-lb-loaded'));
    } catch (err) {
      console.error('coin leaderboard fetch error:', err);
    }
  }, []);

  useEffect(() => {
    const coinLeaderboardWindow = window as CoinLeaderboardWindow;
    coinLeaderboardWindow.__BASE_FETCH_COIN_LB = fetchLeaderboard;
    return () => {
      delete coinLeaderboardWindow.__BASE_FETCH_COIN_LB;
    };
  }, [fetchLeaderboard]);

  return { fetchLeaderboard };
}
