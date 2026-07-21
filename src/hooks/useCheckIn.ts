'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { encodeFunctionData, numberToHex } from 'viem';
import { Attribution } from 'ox/erc8021';
import { CHECKIN_ABI, CHECKIN_ADDRESS } from '@/config/checkin-contract';
import { reportGameTx } from '@/lib/reportGameTx';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

type WalletRequestClient = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

type CheckInWindow = Window & {
  __BASE_CHECKIN?: {
    streak: number;
    total: number;
    isAvailable: boolean;
    isPending: boolean;
  };
  __BASE_CHECKIN_CLAIM?: () => Promise<void>;
};

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
      reportGameTx(address, txHash);
      refetch().then(() => {
        window.dispatchEvent(new CustomEvent('base-checkin-confirmed'));
      });
    }
  }, [isSuccess, txHash, address, refetch]);

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
        const rpcClient = walletClient as WalletRequestClient;
        const callData = encodeFunctionData({
          abi: CHECKIN_ABI,
          functionName: 'checkIn',
        });

        setPaymasterPending(true);
        const callsId = await rpcClient.request({
          method: 'wallet_sendCalls',
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
        }) as string;

        // Poll wallet_getCallsStatus until confirmed (max 90s)
        let elapsed = 0;
        let pollFails = 0;
        const finish = async () => {
          setPaymasterPending(false);
          await refetch();
          // Give React one extra tick to re-render window.__BASE_CHECKIN
          setTimeout(() => window.dispatchEvent(new CustomEvent('base-checkin-confirmed')), 100);
        };
        const iv = setInterval(async () => {
          elapsed += 2000;
          try {
            const res = await rpcClient.request({
              method: 'wallet_getCallsStatus',
              params: [callsId],
            }) as { status: number | string; receipts?: Array<{ transactionHash?: string }> };
            const s = res?.status;
            const confirmed = s === 200 || s === 'CONFIRMED' || s === 'confirmed';
            const failed    = s === 400 || s === 'FAILED'    || s === 'failed';
            if (confirmed || failed || elapsed >= 90000) {
              clearInterval(iv);
              if (confirmed) reportGameTx(address, res?.receipts?.[0]?.transactionHash);
              if (confirmed || elapsed >= 90000) await finish();
              else setPaymasterPending(false);
            }
          } catch {
            pollFails++;
            if (pollFails >= 5 || elapsed >= 15000) { clearInterval(iv); await finish(); }
          }
        }, 2000);
        timeoutRef.current = iv;
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
    const checkInWindow = window as CheckInWindow;
    checkInWindow.__BASE_CHECKIN = {
      streak,
      total,
      isAvailable,
      isPending,
    };
    checkInWindow.__BASE_CHECKIN_CLAIM = claim;

    return () => {
      delete checkInWindow.__BASE_CHECKIN;
      delete checkInWindow.__BASE_CHECKIN_CLAIM;
    };
  }, [streak, total, isAvailable, isPending, claim]);

  return { streak, total, isAvailable, claim, isPending, isConfirming, isSuccess };
}
