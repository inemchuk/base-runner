'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

export function useLeaderboard() {
  const { address } = useAccount();

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/score/leaderboard');
      const data = await res.json();
      (window as any).__BASE_LEADERBOARD_ENTRIES = data.entries || [];
      window.dispatchEvent(new CustomEvent('base-leaderboard-loaded'));
    } catch (err) {
      console.error('leaderboard fetch error:', err);
    }
  }, []);

  const submit = useCallback(async (score: number) => {
    if (!address) return;
    try {
      await fetch('/api/score/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, score }),
      });
      // Refetch leaderboard after submit
      await fetchLeaderboard();
      window.dispatchEvent(new CustomEvent('base-score-submitted'));
    } catch (err) {
      console.error('score submit error:', err);
    }
  }, [address, fetchLeaderboard]);

  useEffect(() => {
    (window as any).__BASE_SUBMIT_SCORE = submit;
    (window as any).__BASE_LEADERBOARD = { myBest: 0, isPending: false };

    // Fetch on mount
    fetchLeaderboard();

    return () => {
      delete (window as any).__BASE_SUBMIT_SCORE;
      delete (window as any).__BASE_LEADERBOARD;
      delete (window as any).__BASE_LEADERBOARD_ENTRIES;
    };
  }, [submit, fetchLeaderboard]);

  return { submit, fetchLeaderboard };
}
