'use client';

import { useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CHECKIN_ABI, CHECKIN_ADDRESS } from '@/config/checkin-contract';

export function useCheckIn() {
  const { address } = useAccount();

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
    pollingInterval: 1000,
  });

  // Refetch state after successful tx
  useEffect(() => {
    if (isSuccess) {
      refetch();
      // Notify game.js that check-in was confirmed
      window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
    }
  }, [isSuccess, refetch]);

  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastDay = stateData ? Number(stateData[0]) : 0;
  const streak = stateData ? Number(stateData[1]) : 0;
  const total = stateData ? Number(stateData[2]) : 0;
  const isAvailable = lastDay < todayUTC;

  const claim = useCallback(() => {
    writeContract({
      address: CHECKIN_ADDRESS,
      abi: CHECKIN_ABI,
      functionName: 'checkIn',
    });
  }, [writeContract]);

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
