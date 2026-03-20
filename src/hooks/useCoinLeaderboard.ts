'use client';

import { useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { getName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';

async function resolveBasename(address: string): Promise<string> {
  try {
    const name = await getName({ address: address as `0x${string}`, chain: base });
    if (name) return name.replace('.base.eth', '.base');
  } catch {}
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function useCoinLeaderboard() {
  const { address } = useAccount();

  // Синхронизирует текущий баланс монет игрока на сервер
  const syncCoins = useCallback(async (balance: number) => {
    if (!address) return;
    try {
      await fetch('/api/coins/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, balance }),
      });
    } catch {}
  }, [address]);

  // Загружает топ-20 и отдаёт в game.js через window
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/coins/leaderboard');
      const { entries } = await res.json();

      const resolved = await Promise.all(
        entries.map(async (e: { address: string; balance: number }, i: number) => {
          const name = await resolveBasename(e.address);
          return { rank: i + 1, name, balance: e.balance, address: e.address };
        })
      );

      (window as any).__BASE_COIN_LB_ENTRIES = resolved;
      window.dispatchEvent(new CustomEvent('base-coin-lb-loaded'));
    } catch {}
  }, []);

  // Отдаём функции в game.js
  useEffect(() => {
    (window as any).__BASE_SYNC_COINS = syncCoins;
    (window as any).__BASE_FETCH_COIN_LB = fetchLeaderboard;

    // Синхронизируем при загрузке
    const saved = localStorage.getItem('save_v1');
    if (saved && address) {
      try {
        const data = JSON.parse(saved);
        if (typeof data.coins === 'number') syncCoins(data.coins);
      } catch {}
    }

    return () => {
      delete (window as any).__BASE_SYNC_COINS;
      delete (window as any).__BASE_FETCH_COIN_LB;
    };
  }, [address, syncCoins, fetchLeaderboard]);

  return { syncCoins, fetchLeaderboard };
}
