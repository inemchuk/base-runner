'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { Attribution } from 'ox/erc8021';
import { CHECKIN_ABI, CHECKIN_ADDRESS } from '@/config/checkin-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });

export function useCheckIn() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: stateData, refetch } = useReadContract({
    address: CHECKIN_ADDRESS,
    abi: CHECKIN_ABI,
    functionName: 'getState',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
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

  // Fallback: if tx was sent but isSuccess never fires in 90s, force refetch
  useEffect(() => {
    if (txHash && isConfirming) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        refetch().then(() => {
          window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
        });
      }, 90000);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [txHash, isConfirming, refetch]);

  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastDay = stateData ? Number(stateData[0]) : 0;
  const streak = stateData ? Number(stateData[1]) : 0;
  const total = stateData ? Number(stateData[2]) : 0;
  const isAvailable = lastDay < todayUTC;

  const claim = useCallback(async () => {
    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }
    writeContract({
      address: CHECKIN_ADDRESS,
      abi: CHECKIN_ABI,
      functionName: 'checkIn',
      dataSuffix: DATA_SUFFIX,
    });
  }, [writeContract, switchChainAsync, chainId]);

  // Expose to game.js via window
  useEffect(() => {
    (window as any).__BASE_CHECKIN = {
      streak,
      total,
      isAvailable,
      isPending: isPending || isConfirming,
    };
    (window as any).__BASE_CHECKIN_CLAIM = claim;

    return () => {
      delete (window as any).__BASE_CHECKIN;
      delete (window as any).__BASE_CHECKIN_CLAIM;
    };
  }, [streak, total, isAvailable, isPending, isConfirming, claim]);

  return { streak, total, isAvailable, claim, isPending, isConfirming, isSuccess };
}
