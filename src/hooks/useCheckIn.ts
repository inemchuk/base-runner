'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
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
  const [paymasterPending, setPaymasterPending] = useState(false);

  const { data: stateData, refetch } = useReadContract({
    address: CHECKIN_ADDRESS,
    abi: CHECKIN_ABI,
    functionName: 'getState',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Fallback: regular tx via useWriteContract (original logic, untouched)
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  // Refetch after confirmed fallback tx
  useEffect(() => {
    if (isSuccess) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      refetch().then(() => {
        window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
      });
    }
  }, [isSuccess, refetch]);

  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastDay  = stateData ? Number(stateData[0]) : 0;
  const streak   = stateData ? Number(stateData[1]) : 0;
  const total    = stateData ? Number(stateData[2]) : 0;
  const isAvailable = lastDay < todayUTC;
  const isPending = isWritePending || isConfirming || paymasterPending;

  const claim = useCallback(async () => {
    if (!address) return;

    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }

    // Try gasless via Paymaster (only if wallet supports wallet_sendCalls)
    if (PAYMASTER_URL && walletClient) {
      try {
        const callData = encodeFunctionData({
          abi: CHECKIN_ABI,
          functionName: 'checkIn',
        });

        setPaymasterPending(true);
        await walletClient.request({
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

        // Paymaster succeeded — poll for confirmation
        timeoutRef.current = setTimeout(() => {
          setPaymasterPending(false);
          refetch().then(() => {
            window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
          });
        }, 30000);
        return;

      } catch {
        // wallet_sendCalls not supported or paymaster rejected — fall through to regular tx
        setPaymasterPending(false);
      }
    }

    // Fallback: original regular transaction (user pays gas)
    writeContract({
      address: CHECKIN_ADDRESS,
      abi: CHECKIN_ABI,
      functionName: 'checkIn',
      dataSuffix: DATA_SUFFIX,
    });

  }, [address, walletClient, chainId, switchChainAsync, writeContract, refetch]);

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
