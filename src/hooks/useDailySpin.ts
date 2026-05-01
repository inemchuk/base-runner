'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { spinCost } from '@/config/spin-contract';

export interface SpinPrize {
  type: 'coins' | 'booster' | 'trail' | 'skin';
  value: string | number;
  label: string;
  icon: string;
}


export function useDailySpin() {
  const { address } = useAccount();

  const [isPending,  setIsPending]  = useState(false);
  const [prize,      setPrize]      = useState<SpinPrize | null>(null);
  const [nextAt,     setNextAt]     = useState(0);
  const [spinsToday, setSpinsToday] = useState(0);
  const [nextCost,   setNextCost]   = useState(0); // 0 = free
  // ── Fetch spin state from Redis on mount / address change ─────────────────
  const fetchState = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`/api/spin?address=${address}`);
      const d = await r.json();
      setSpinsToday(d.spinsToday ?? 0);
      setNextCost(d.nextCost     ?? 0);
      setNextAt(d.nextAt         ?? 0);
    } catch {}
  }, [address]);

  useEffect(() => { fetchState(); }, [fetchState]);

  // ── POST /api/spin → deduct coins + get prize ─────────────────────────────
  async function _fetchPrize(addr: string) {
    try {
      const r = await fetch('/api/spin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr }),
      });

      if (r.status === 402) {
        const d = await r.json();
        window.dispatchEvent(new CustomEvent('spin-insufficient', { detail: d }));
        return;
      }

      const d = await r.json();
      if (d.ok && d.prize) {
        setPrize(d.prize);
        setSpinsToday(d.spinsToday ?? 0);
        setNextCost(d.nextCost     ?? 0);
        setNextAt(d.nextAt         ?? 0);
        window.dispatchEvent(new CustomEvent('spin-prize', { detail: d.prize }));
      }
    } catch {}
  }

  // ── Main spin — Redis-only, no wallet interaction needed ─────────────────
  const doSpin = useCallback(async () => {
    if (!address || isPending) return;
    setIsPending(true);
    try {
      await _fetchPrize(address);
    } finally {
      setIsPending(false);
    }
  }, [address, isPending]);

  // ── Expose to game.js ─────────────────────────────────────────────────────
  useEffect(() => {
    (window as any).__SPIN       = { isPending, nextCost, spinsToday, nextAt };
    (window as any).__SPIN_DO    = doSpin;
    // Safety fallback: game.js calls this if tx never confirms (e.g. no wallet)
    (window as any).__SPIN_FETCH = () => _fetchPrize(address || '0x000000000000000000000000000000000000dead');
    return () => {
      delete (window as any).__SPIN;
      delete (window as any).__SPIN_DO;
      delete (window as any).__SPIN_FETCH;
    };
  }, [isPending, nextCost, spinsToday, nextAt, doSpin, address]);

  return { isPending, prize, nextCost, spinsToday, nextAt, doSpin };
}
