'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { numberToHex, encodeFunctionData } from 'viem';
import { NFT_ABI, NFT_CONTRACT, NFT_DEPLOYED } from '@/config/nft-contract';

const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL;

export function useNftMint() {
  const { address, chainId }   = useAccount();
  const { switchChainAsync }   = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [mintingItem, setMintingItem]   = useState<string | null>(null);
  const [paymasterPath, setPaymasterPath] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash:            paymasterPath ? undefined : txHash,
    chainId:         base.id,
    pollingInterval: 2000,
    confirmations:   1,
  });

  const isPending = isWritePending || isConfirming || !!mintingItem;

  // Regular tx path: fire after on-chain confirmation
  useEffect(() => {
    if (isSuccess && mintingItem && !paymasterPath) {
      window.dispatchEvent(new CustomEvent('nft-minted', { detail: { itemId: mintingItem } }));
      setMintingItem(null);
    }
  }, [isSuccess, mintingItem, paymasterPath]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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

    const callData = encodeFunctionData({
      abi:          NFT_ABI,
      functionName: 'claim',
      args:         [BigInt(tokenId), sig],
    });

    // 2. Try paymaster via wallet_sendCalls + poll wallet_getCallsStatus
    if (PAYMASTER_URL && walletClient) {
      try {
        const callsId = await walletClient.request({
          method: 'wallet_sendCalls' as any,
          params: [{
            version:  '1.0',
            chainId:  numberToHex(base.id),
            from:     address,
            calls:    [{ to: NFT_CONTRACT, data: callData }],
            capabilities: { paymasterService: { url: PAYMASTER_URL } },
          }],
        } as any) as string;

        setPaymasterPath(true);

        // Poll wallet_getCallsStatus until confirmed or failed (max 60s)
        // Coinbase returns status as number (200/400) OR string ('CONFIRMED'/'FAILED')
        let elapsed = 0;
        let pollFails = 0;
        pollRef.current = setInterval(async () => {
          elapsed += 2000;
          try {
            const res = await walletClient.request({
              method: 'wallet_getCallsStatus' as any,
              params: [callsId],
            } as any) as { status: number | string; receipts?: unknown[] };

            const s = res?.status;
            const confirmed = s === 200 || s === 'CONFIRMED' || s === 'confirmed';
            const failed    = s === 400 || s === 'FAILED'    || s === 'failed';

            if (confirmed) {
              clearInterval(pollRef.current!); pollRef.current = null;
              window.dispatchEvent(new CustomEvent('nft-minted', { detail: { itemId } }));
              setMintingItem(null); setPaymasterPath(false);
            } else if (failed) {
              clearInterval(pollRef.current!); pollRef.current = null;
              window.dispatchEvent(new CustomEvent('nft-mint-error', { detail: { error: 'transaction failed' } }));
              setMintingItem(null); setPaymasterPath(false);
            } else if (elapsed >= 60000) {
              // 60s timeout — tx was submitted & approved by user, treat as success
              clearInterval(pollRef.current!); pollRef.current = null;
              window.dispatchEvent(new CustomEvent('nft-minted', { detail: { itemId } }));
              setMintingItem(null); setPaymasterPath(false);
            }
          } catch {
            pollFails++;
            // If wallet_getCallsStatus consistently fails (unsupported), treat as success after 15s
            if (pollFails >= 5 || elapsed >= 15000) {
              clearInterval(pollRef.current!); pollRef.current = null;
              window.dispatchEvent(new CustomEvent('nft-minted', { detail: { itemId } }));
              setMintingItem(null); setPaymasterPath(false);
            }
          }
        }, 2000);

        return;
      } catch {
        // wallet_sendCalls not supported — fall through to regular tx
        setPaymasterPath(false);
      }
    }

    // 3. Regular tx (user pays gas)
    setPaymasterPath(false);
    writeContract({
      address:      NFT_CONTRACT,
      abi:          NFT_ABI,
      functionName: 'claim',
      args:         [BigInt(tokenId), sig],
    });
  }, [address, chainId, isPending, walletClient, switchChainAsync, writeContract]);

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
