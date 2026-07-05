'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

type QuestWindow = Window & {
  Quests?: {
    applyServerData?: (data: Record<string, { progress: number; claimed: boolean[] }>) => void;
  };
  __BASE_QUEST_SYNC?: (data: Record<string, { progress: number; claimed: boolean[] }>) => Promise<void>;
};

export function useQuestSync() {
  const { address } = useAccount();

  // Sync quest data to server
  const syncQuests = useCallback(async (data: Record<string, { progress: number; claimed: boolean[] }>) => {
    if (!address) return;
    try {
      await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, data }),
      });
    } catch (err) {
      console.error('quest sync error:', err);
    }
  }, [address]);

  // Load quest data from server on mount
  const loadQuests = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/quests?address=${address}`);
      const json = await res.json() as {
        data?: Record<string, { progress: number; claimed: boolean[] }>;
      };
      if (json.data) {
        const applyFn = (window as QuestWindow).Quests?.applyServerData;
        if (applyFn) applyFn(json.data);
      }
    } catch (err) {
      console.error('quest load error:', err);
    }
  }, [address]);

  useEffect(() => {
    const questWindow = window as QuestWindow;
    questWindow.__BASE_QUEST_SYNC = syncQuests;

    // Load from server after a short delay (wait for game.js to init)
    const timer = setTimeout(() => loadQuests(), 2000);

    return () => {
      delete questWindow.__BASE_QUEST_SYNC;
      clearTimeout(timer);
    };
  }, [syncQuests, loadQuests]);

  return { syncQuests, loadQuests };
}
