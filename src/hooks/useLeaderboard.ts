'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { createRunSessionTokens } from '@/lib/client/runSessionTokens';

type LeaderboardEntry = Record<string, unknown>;

type LeaderboardWindow = Window & {
  __BASE_LEADERBOARD_ENTRIES?: LeaderboardEntry[];
  __BASE_SUBMIT_SCORE?: (
    runId: number,
    score: number,
    sessionCoins?: number,
  ) => Promise<unknown>;
  __BASE_SESSION_START?: (runId: number) => Promise<void>;
  __BASE_FETCH_SCORE_LB?: (period?: string) => Promise<void>;
  __BASE_LEADERBOARD?: {
    myBest: number;
    isPending: boolean;
  };
};

export function useLeaderboard() {
  const { address } = useAccount();
  const sessionTokensRef = useRef(createRunSessionTokens());

  const fetchLeaderboard = useCallback(async (period: string = 'alltime') => {
    try {
      const res = await fetch(`/api/score/leaderboard?period=${period}`);
      const data = await res.json() as { entries?: LeaderboardEntry[] };
      (window as LeaderboardWindow).__BASE_LEADERBOARD_ENTRIES = data.entries || [];
      window.dispatchEvent(new CustomEvent('base-leaderboard-loaded'));
    } catch (err) {
      console.error('leaderboard fetch error:', err);
    }
  }, []);

  // Called by game.js via __BASE_SESSION_START when a new game begins
  const fetchSessionToken = useCallback(async (runId: number) => {
    if (!address) return;

    const tokenRequest: Promise<string | null> = fetch('/api/score/session', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ address }),
    }).then(async (res) => {
      const data = await res.json() as { token?: string | null };
      return data.token ?? null;
    }).catch((err: unknown) => {
      console.error('session token fetch error:', err);
      return null;
    });

    await sessionTokensRef.current.start(runId, tokenRequest);
  }, [address]);

  const submit = useCallback(async (runId: number, score: number, sessionCoins = 0) => {
    if (!address) return { ok: false, error: 'no_address' };
    try {
      const token = await sessionTokensRef.current.take(runId);
      const res = await fetch('/api/score/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          address,
          score,
          sessionCoins,
          token,
        }),
      });
      const data = await res.json();
      await fetchLeaderboard();
      window.dispatchEvent(new CustomEvent('base-score-submitted', { detail: data }));
      return data;
    } catch (err) {
      console.error('score submit error:', err);
      return { ok: false, error: 'submit_failed' };
    }
  }, [address, fetchLeaderboard]);

  useEffect(() => {
    const sessionTokens = sessionTokensRef.current;
    sessionTokens.clear();
    return () => sessionTokens.clear();
  }, [address]);

  useEffect(() => {
    const leaderboardWindow = window as LeaderboardWindow;
    leaderboardWindow.__BASE_SUBMIT_SCORE = submit;
    leaderboardWindow.__BASE_SESSION_START = fetchSessionToken;
    leaderboardWindow.__BASE_FETCH_SCORE_LB = fetchLeaderboard;
    leaderboardWindow.__BASE_LEADERBOARD = { myBest: 0, isPending: false };

    fetchLeaderboard('alltime');

    return () => {
      delete leaderboardWindow.__BASE_SUBMIT_SCORE;
      delete leaderboardWindow.__BASE_SESSION_START;
      delete leaderboardWindow.__BASE_FETCH_SCORE_LB;
      delete leaderboardWindow.__BASE_LEADERBOARD;
      delete leaderboardWindow.__BASE_LEADERBOARD_ENTRIES;
    };
  }, [submit, fetchSessionToken, fetchLeaderboard]);

  return { submit, fetchLeaderboard, fetchSessionToken };
}
