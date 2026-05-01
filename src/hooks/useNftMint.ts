'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { NFT_ABI, NFT_CONTRACT, NFT_DEPLOYED } from '@/config/nft-contract';

export function useNftMint() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [mintingItem, setMintingItem] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash:            txHash,
    chainId:         base.id,
    pollingInterval: 2000,
    confirmations:   1,
  });

  const isPending = isWritePending || isConfirming || !!mintingItem;

  // Fire nft-minted only after on-chain confirmation
  useEffect(() => {
    if (isSuccess && mintingItem) {
      window.dispatchEvent(new CustomEvent('nft-minted', { detail: { itemId: mintingItem } }));
      setMintingItem(null);
    }
  }, [isSuccess, mintingItem]);

  const mint = useCallback(async (itemId: string) => {
    if (!address || !NFT_DEPLOYED) {
      window.dispatchEvent(new CustomEvent('nft-mint-error', { detail: { error: 'contract not deployed' } }));
      return;
    }
    if (isPending) return;

    if (chainId !== base.id) {
      try { await switchChainAsync({ chainId: base.id }); }
      catch { return; }
    }

    // 1. Get backend signature
    let sig: `0x${string}`;
    let tokenId: number;
    try {
      const r = await fetch('/api/nft/sign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, itemId }),
      });
      if (!r.ok) {
        const e = await r.json();
        window.dispatchEvent(new CustomEvent('nft-mint-error', { detail: e }));
        return;
      }
      ({ sig, tokenId } = await r.json());
    } catch {
      window.dispatchEvent(new CustomEvent('nft-mint-error', { detail: { error: 'network error' } }));
      return;
    }

    setMintingItem(itemId);

    // 2. Send tx — Coinbase Smart Wallet picks up paymaster automatically
    //    for allowlisted contracts (no wallet_sendCalls needed)
    writeContract({
      address:      NFT_CONTRACT,
      abi:          NFT_ABI,
      functionName: 'claim',
      args:         [BigInt(tokenId), sig],
    });
  }, [address, chainId, isPending, switchChainAsync, writeContract]);

  // Expose to game.js
  useEffect(() => {
    (window as any).__NFT_MINT     = mint;
    (window as any).__NFT_PENDING  = isPending;
    (window as any).__NFT_DEPLOYED = NFT_DEPLOYED;
    return () => {
      delete (window as any).__NFT_MINT;
      delete (window as any).__NFT_PENDING;
      delete (window as any).__NFT_DEPLOYED;
    };
  }, [mint, isPending]);

  return { mint, isPending };
}
