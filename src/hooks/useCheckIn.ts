'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { encodeFunctionData, numberToHex } from 'viem';
import { Attribution } from 'ox/erc8021';
import { CHECKIN_ABI, CHECKIN_ADDRESS } from '@/config/checkin-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

export function useCheckIn() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const txHashRef = useRef<`0x${string}` | null>(null);

  const { data: stateData, refetch } = useReadContract({
    address: CHECKIN_ADDRESS,
    abi: CHECKIN_ABI,
    functionName: 'getState',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHashRef.current ?? undefined,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  // Refetch state after successful tx
  useEffect(() => {
    if (isSuccess) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      refetch().then(() => {
        window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
      });
    }
  }, [isSuccess, refetch]);

  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastDay = stateData ? Number(stateData[0]) : 0;
  const streak = stateData ? Number(stateData[1]) : 0;
  const total = stateData ? Number(stateData[2]) : 0;
  const isAvailable = lastDay < todayUTC;
  const isPending = isConfirming;

  const claim = useCallback(async () => {
    if (!address || !walletClient) return;

    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }

    try {
      // Try gasless via Paymaster first
      if (PAYMASTER_URL) {
        const callData = encodeFunctionData({
          abi: CHECKIN_ABI,
          functionName: 'checkIn',
        });

        const result = await walletClient.request({
          method: 'wallet_sendCalls' as any,
          params: [{
            version: '1.0',
            chainId: numberToHex(base.id),
            from: address,
            calls: [{
              to: CHECKIN_ADDRESS,
              data: (callData + DATA_SUFFIX.slice(2)) as `0x${string}`,
            }],
            capabilities: {
              paymasterService: { url: PAYMASTER_URL },
            },
          }],
        } as any);

        // wallet_sendCalls returns a bundle id or tx hash
        if (result) {
          timeoutRef.current = setTimeout(() => {
            refetch().then(() => {
              window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
            });
          }, 30000);
          return;
        }
      }
    } catch (e) {
      // Paymaster not supported or failed — fall back to regular tx
      console.warn('Paymaster failed, falling back to regular tx:', e);
    }

    // Fallback: regular transaction (user pays gas)
    const hash = await walletClient.writeContract({
      address: CHECKIN_ADDRESS,
      abi: CHECKIN_ABI,
      functionName: 'checkIn',
      dataSuffix: DATA_SUFFIX,
    });
    txHashRef.current = hash;

  }, [address, walletClient, chainId, switchChainAsync, refetch]);

  // Expose to game.js via window
  useEffect(() => {
    (window as any).__BASE_CHECKIN = {
      streak,
      total,
      isAvailable,
      isPending,
    };
    (window as any).__BASE_CHECKIN_CLAIM = claim;

    return () => {
      delete (window as any).__BASE_CHECKIN;
      delete (window as any).__BASE_CHECKIN_CLAIM;
    };
  }, [streak, total, isAvailable, isPending, claim]);

  return { streak, total, isAvailable, claim, isPending, isConfirming, isSuccess };
}
