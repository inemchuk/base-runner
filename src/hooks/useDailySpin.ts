'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { numberToHex } from 'viem';
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

  // No useReadContract — all state comes from Redis via GET /api/spin
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash:            txHash,
    chainId:         base.id,
    pollingInterval: 2000,
    confirmations:   1,
  });

  const isPending = isWritePending || isConfirming || paymasterPending;

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

  // ── After on-chain tx confirms → claim prize from Redis ──────────────────
  useEffect(() => {
    if (!isSuccess || !address) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    _fetchPrize(address);
  }, [isSuccess, address]);

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

    if (CONTRACT_DEPLOYED) {
      // Path A: Paymaster (gasless on-chain tx → then Redis prize)
      if (PAYMASTER_URL && walletClient) {
        try {
          setPaymasterPending(true);
          await walletClient.request({
            method: 'wallet_sendCalls' as any,
            params: [{
              version:  '1.0',
              chainId:  numberToHex(base.id),
              from:     address,
              calls:    [{ to: SPIN_ADDRESS }],
              capabilities: { paymasterService: { url: PAYMASTER_URL } },
            }],
          } as any);

          // Poll for prize after Paymaster confirms (~15s)
          timeoutRef.current = setTimeout(() => {
            setPaymasterPending(false);
            _fetchPrize(address);
          }, 15000);
          return;
        } catch {
          setPaymasterPending(false);
        }
      }

      // Path B: regular on-chain tx (useWaitForTransactionReceipt handles completion)
      writeContract({ address: SPIN_ADDRESS, abi: SPIN_ABI, functionName: 'spin' });

    } else {
      // Path C: no contract yet — Redis only (local dev)
      await _fetchPrize(address);
    }
  }, [address, isPending, chainId, walletClient, switchChainAsync, writeContract]);

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
