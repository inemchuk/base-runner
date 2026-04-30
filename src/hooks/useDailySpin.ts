'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { numberToHex, encodeFunctionData } from 'viem';
import { SPIN_ABI, SPIN_ADDRESS, spinCost } from '@/config/spin-contract';

export interface SpinPrize {
  type: 'coins' | 'booster' | 'trail' | 'skin';
  value: string | number;
  label: string;
  icon: string;
}

const PAYMASTER_URL     = process.env.NEXT_PUBLIC_PAYMASTER_URL;
const CONTRACT_DEPLOYED = (SPIN_ADDRESS as string) !== '0x0000000000000000000000000000000000000000';

export function useDailySpin() {
  const { address, chainId }   = useAccount();
  const { switchChainAsync }   = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [paymasterPending, setPaymasterPending] = useState(false);
  const [prize,      setPrize]      = useState<SpinPrize | null>(null);
  const [nextAt,     setNextAt]     = useState(0);
  const [spinsToday, setSpinsToday] = useState(0);
  const [nextCost,   setNextCost]   = useState(0); // 0 = free
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPending = paymasterPending;

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

  // ── Main spin ─────────────────────────────────────────────────────────────
  const doSpin = useCallback(async () => {
    if (!address || isPending) return;

    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }

    // Path A: Paymaster gasless on-chain tx (best-effort — contract is cosmetic)
    if (CONTRACT_DEPLOYED && PAYMASTER_URL && walletClient) {
      try {
        setPaymasterPending(true);
        await walletClient.request({
          method: 'wallet_sendCalls' as any,
          params: [{
            version:  '1.0',
            chainId:  numberToHex(base.id),
            from:     address,
            calls:    [{ to: SPIN_ADDRESS, data: encodeFunctionData({ abi: SPIN_ABI, functionName: 'spin' }) }],
            capabilities: { paymasterService: { url: PAYMASTER_URL } },
          }],
        } as any);

        // Paymaster succeeded — poll for prize
        timeoutRef.current = setTimeout(() => {
          setPaymasterPending(false);
          _fetchPrize(address);
        }, 15000);
        return;
      } catch {
        // Paymaster rejected or wallet_sendCalls unsupported — fall through to Redis-only
        setPaymasterPending(false);
      }
    }

    // Path B: Redis-only (no gas required — prize logic is server-side anyway)
    await _fetchPrize(address);
  }, [address, isPending, chainId, walletClient, switchChainAsync]);

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
