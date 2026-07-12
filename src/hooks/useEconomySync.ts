'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { getEconomySessionToken } from '@/lib/client/sessionToken';

type EconomyAction = {
  action: 'setFocus' | 'topUp' | 'craft' | 'dailyFragmentChest' | 'buyItem' | 'buyBoosterPack';
  itemId?: string;
};

type EconomyClaim = {
  source: 'checkin' | 'quest' | 'level';
  questId?: string;
  level?: number;
  period?: string;
};

type EconomyResponse = {
  ok: boolean;
  error?: string;
  shop?: unknown;
  coins?: number;
  quests?: unknown;
  levels?: unknown;
  chest?: unknown;
  result?: {
    coinsDelta?: number;
    fragmentsDelta?: number;
    boostersDelta?: number;
    xpDelta?: number;
  };
};

type EconomyWindow = Window & {
  Shop?: {
    applyServerEconomyData?: (shop: unknown) => void;
  };
  Quests?: {
    applyServerData?: (quests: unknown) => void;
  };
  Xp?: {
    applyServerState?: (levels: unknown) => void;
  };
  RewardEconomy?: {
    setCoinsLocal?: (coins: number) => void;
  };
  __BASE_ECONOMY_FETCH?: () => Promise<EconomyResponse>;
  __BASE_ECONOMY_ACTION?: (payload: EconomyAction) => Promise<EconomyResponse>;
  __BASE_ECONOMY_CLAIM?: (payload: EconomyClaim) => Promise<EconomyResponse>;
};

export function useEconomySync() {
  const { address } = useAccount();
  const hydratedAddressRef = useRef<string | null>(null);

  const applyEconomy = useCallback((payload: EconomyResponse) => {
    const economyWindow = window as EconomyWindow;
    if (payload.shop) {
      const applyFn = economyWindow.Shop?.applyServerEconomyData;
      if (typeof applyFn === 'function') applyFn(payload.shop);
    }
    if (typeof payload.coins === 'number') {
      economyWindow.RewardEconomy?.setCoinsLocal?.(payload.coins);
    }
    if (payload.quests) {
      economyWindow.Quests?.applyServerData?.(payload.quests);
    }
    if (payload.levels) {
      economyWindow.Xp?.applyServerState?.(payload.levels);
    }
  }, []);

  const hydrateLegacyEconomy = useCallback(async (): Promise<EconomyResponse> => {
    if (!address) return { ok: false, error: 'no_address' };
    if (hydratedAddressRef.current === address) return { ok: true };
    try {
      const token = await getEconomySessionToken(address);
      const res = await fetch('/api/economy/hydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token, legacy: readLegacyEconomySnapshot() }),
      });
      const data = await res.json() as EconomyResponse;
      if (data.ok) {
        hydratedAddressRef.current = address;
        applyEconomy(data);
      }
      return data;
    } catch (err) {
      console.error('economy hydrate error:', err);
      hydratedAddressRef.current = null;
      return { ok: false, error: 'hydrate_failed' };
    }
  }, [address, applyEconomy]);

  const fetchEconomy = useCallback(async () => {
    if (!address) return { ok: false, error: 'no_address' };
    try {
      const res = await fetch(`/api/economy?address=${address}`);
      const data = await res.json() as EconomyResponse;
      if (data.ok) applyEconomy(data);
      return data;
    } catch (err) {
      console.error('economy fetch error:', err);
      return { ok: false, error: 'fetch_failed' };
    }
  }, [address, applyEconomy]);

  const runAction = useCallback(async (payload: EconomyAction): Promise<EconomyResponse> => {
    if (!address) return { ok: false, error: 'no_address' };
    try {
      const res = await fetch('/api/economy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, ...payload }),
      });
      const data = await res.json() as EconomyResponse;
      if (data.ok) applyEconomy(data);
      return data;
    } catch (err) {
      console.error('economy action error:', err);
      return { ok: false, error: 'action_failed' };
    }
  }, [address, applyEconomy]);

  const runClaim = useCallback(async (payload: EconomyClaim): Promise<EconomyResponse> => {
    if (!address) return { ok: false, error: 'no_address' };
    try {
      const res = await fetch('/api/economy/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, ...payload }),
      });
      const data = await res.json() as EconomyResponse;
      if (data.ok) applyEconomy(data);
      return data;
    } catch (err) {
      console.error('economy claim error:', err);
      return { ok: false, error: 'claim_failed' };
    }
  }, [address, applyEconomy]);

  useEffect(() => {
    const economyWindow = window as EconomyWindow;
    economyWindow.__BASE_ECONOMY_FETCH = fetchEconomy;
    economyWindow.__BASE_ECONOMY_ACTION = runAction;
    economyWindow.__BASE_ECONOMY_CLAIM = runClaim;
    const timer = setTimeout(async () => {
      await hydrateLegacyEconomy();
      await fetchEconomy();
    }, 1700);
    return () => {
      delete economyWindow.__BASE_ECONOMY_FETCH;
      delete economyWindow.__BASE_ECONOMY_ACTION;
      delete economyWindow.__BASE_ECONOMY_CLAIM;
      clearTimeout(timer);
    };
  }, [fetchEconomy, hydrateLegacyEconomy, runAction, runClaim]);

  useEffect(() => {
    if (!address) return;
    const timer = setTimeout(async () => {
      await hydrateLegacyEconomy();
      await fetchEconomy();
    }, 500);
    return () => clearTimeout(timer);
  }, [address, fetchEconomy, hydrateLegacyEconomy]);

  return { fetchEconomy, runAction };
}

function readLegacyEconomySnapshot() {
  const save = readLocalJson('crossy_save_v1');
  return {
    coins: safeNumber(save?.coins),
    bestScore: safeNumber(save?.bestScore),
    shop: readLocalJson('shop_v1') ?? {},
    quests: readLocalJson('quests_v1') ?? {},
    levels: readLocalJson('xp_v1') ?? {},
  };
}

function readLocalJson(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function safeNumber(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}
