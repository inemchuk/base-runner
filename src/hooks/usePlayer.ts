'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';

declare global {
  interface Window {
    __BASE_WALLET?: string;
  }
}

export function usePlayer() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    window.__BASE_WALLET = address ?? undefined;
  }, [address]);

  return { address, isConnected };
}
