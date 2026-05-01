'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';

export function useLeaderboard() {
  const { address } = useAccount();
  const sessionTokenRef = useRef<string | null>(null);

  const fetchLeaderboard = useCallback(async (period: string = 'alltime') => {
    try {
      const res = await fetch(`/api/score/leaderboard?period=${period}`);
      const data = await res.json();
      (window as any).__BASE_LEADERBOARD_ENTRIES = data.entries || [];
      window.dispatchEvent(new CustomEvent('base-leaderboard-loaded'));
    } catch (err) {
      console.error('leaderboard fetch error:', err);
    }
  }, []);

  // Called by game.js via __BASE_SESSION_START when a new game begins
  const fetchSessionToken = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch('/api/score/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address }),
      });
      const data = await res.json();
      sessionTokenRef.current = data.token ?? null;
    } catch (err) {
      console.error('session token fetch error:', err);
      sessionTokenRef.current = null;
    }
  }, [address]);

  const submit = useCallback(async (score: number) => {
    if (!address) return;
    try {
      await fetch('/api/score/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          address,
          score,
          token: sessionTokenRef.current,
        }),
      });
      sessionTokenRef.current = null; // consume — one token per game
      await fetchLeaderboard();
      window.dispatchEvent(new CustomEvent('base-score-submitted'));
    } catch (err) {
      console.error('score submit error:', err);
    }
  }, [address, fetchLeaderboard]);

  useEffect(() => {
    (window as any).__BASE_SUBMIT_SCORE    = submit;
    (window as any).__BASE_SESSION_START   = fetchSessionToken;
    (window as any).__BASE_FETCH_SCORE_LB  = fetchLeaderboard;
    (window as any).__BASE_LEADERBOARD     = { myBest: 0, isPending: false };

    fetchLeaderboard('alltime');

    return () => {
      delete (window as any).__BASE_SUBMIT_SCORE;
      delete (window as any).__BASE_SESSION_START;
      delete (window as any).__BASE_FETCH_SCORE_LB;
      delete (window as any).__BASE_LEADERBOARD;
      delete (window as any).__BASE_LEADERBOARD_ENTRIES;
    };
  }, [submit, fetchSessionToken, fetchLeaderboard]);

  return { submit, fetchLeaderboard, fetchSessionToken };
}
