'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

export interface SpinPrize {
  type:
    | 'coins'
    | 'booster'
    | 'fragments'
    | 'fragment_burst'
    | 'xp'
    | 'crate'
    | 'trail'
    | 'skin'
    | 'nothing';
  value: string | number;
  label: string;
  rarity?: string;
  serverApplied?: boolean;
  fragmentsAwarded?: number;
  fragmentsPooled?: number;
  serverShop?: unknown;
  serverCoins?: number;
}

type SpinWindow = Window & {
  __SPIN?: {
    isPending: boolean;
    nextCost: number;
    spinsToday: number;
    nextAt: number;
  };
  __SPIN_DO?: () => Promise<void>;
  __SPIN_FETCH?: () => Promise<void>;
};

function createSpinId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '_');
  }
  return `spin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}


export function useDailySpin() {
  const { address } = useAccount();

  const [isPending,  setIsPending]  = useState(false);
  const [prize,      setPrize]      = useState<SpinPrize | null>(null);
  const [nextAt,     setNextAt]     = useState(0);
  const [spinsToday, setSpinsToday] = useState(0);
  const [nextCost,   setNextCost]   = useState(0); // 0 = free

  // Ref mirrors isPending so the doSpin closure never reads a stale value
  const pendingRef = useRef(false);
  const pendingSpinIdRef = useRef<string | null>(null);

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
  const _fetchPrize = useCallback(async (addr: string, spinId: string, retry = 0) => {
    try {
      const r = await fetch('/api/spin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address: addr, spinId }),
      });

      if (r.status === 402) {
        const d = await r.json();
        window.dispatchEvent(new CustomEvent('spin-insufficient', { detail: d }));
        return;
      }

      if (r.status === 409) {
        const d = await r.json();
        if (d.error === 'spin_pending' && retry < 4) {
          window.setTimeout(() => { void _fetchPrize(addr, spinId, retry + 1); }, 350);
        }
        return;
      }

      const d = await r.json();
      if (d.ok && d.prize) {
        const prizeDetail = {
          ...d.prize,
          serverShop: d.shop,
          serverCoins: d.coins,
          spinId: d.spinId,
        } as SpinPrize;
        if (pendingSpinIdRef.current === spinId) pendingSpinIdRef.current = null;
        setPrize(prizeDetail);
        setSpinsToday(d.spinsToday ?? 0);
        setNextCost(d.nextCost     ?? 0);
        setNextAt(d.nextAt         ?? 0);
        window.dispatchEvent(new CustomEvent('spin-prize', { detail: prizeDetail }));
      }
    } catch {}
  }, []);

  // ── Main spin — uses ref instead of stale closure ─────────────────────────
  const doSpin = useCallback(async () => {
    if (!address || pendingRef.current) return;
    const spinId = createSpinId();
    pendingSpinIdRef.current = spinId;
    pendingRef.current = true;
    setIsPending(true);
    try {
      await _fetchPrize(address, spinId);
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }, [address, _fetchPrize]);

  // ── Expose to game.js ─────────────────────────────────────────────────────
  useEffect(() => {
    const spinWindow = window as SpinWindow;
    spinWindow.__SPIN       = { isPending, nextCost, spinsToday, nextAt };
    spinWindow.__SPIN_DO    = doSpin;
    // Safety fallback: game.js calls this if tx never confirms (e.g. no wallet)
    spinWindow.__SPIN_FETCH = () => {
      const spinId = pendingSpinIdRef.current ?? createSpinId();
      pendingSpinIdRef.current = spinId;
      return _fetchPrize(address || '0x000000000000000000000000000000000000dead', spinId);
    };
    // Notify game.js so the menu banner / spin button reflect freshly fetched
    // state (the async GET resolves after the menu first renders its banner).
    window.dispatchEvent(new CustomEvent('spin-state'));
    return () => {
      delete spinWindow.__SPIN;
      delete spinWindow.__SPIN_DO;
      delete spinWindow.__SPIN_FETCH;
    };
  }, [isPending, nextCost, spinsToday, nextAt, doSpin, address, _fetchPrize]);

  return { isPending, prize, nextCost, spinsToday, nextAt, doSpin };
}
