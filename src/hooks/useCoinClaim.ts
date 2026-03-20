'use client';

import { useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { Attribution } from 'ox/erc8021';
import { COIN_CONTRACT_ADDRESS, COIN_CONTRACT_ABI } from '@/config/coin-contract';

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ['bc_2a3sfttm'] });

export function useCoinClaim() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
    pollingInterval: 2000,
    confirmations: 1,
  });

  // Подтверждение — сообщаем game.js
  useEffect(() => {
    if (isSuccess) {
      window.dispatchEvent(new CustomEvent('base-coins-claimed'));
    }
  }, [isSuccess]);

  const claim = useCallback(async (amount: number) => {
    if (!address) return;
    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }
    writeContract({
      address: COIN_CONTRACT_ADDRESS,
      abi: COIN_CONTRACT_ABI,
      functionName: 'claimCoins',
      args: [BigInt(amount)],
      dataSuffix: DATA_SUFFIX,
    });
  }, [writeContract, switchChainAsync, chainId, address]);

  // Отдаём game.js через window
  useEffect(() => {
    (window as any).__BASE_CLAIM_COINS = claim;
    (window as any).__BASE_COIN_CLAIM = {
      isPending: isPending || isConfirming,
    };
    return () => {
      delete (window as any).__BASE_CLAIM_COINS;
      delete (window as any).__BASE_COIN_CLAIM;
    };
  }, [claim, isPending, isConfirming]);

  return { claim, isPending, isConfirming, isSuccess };
}
