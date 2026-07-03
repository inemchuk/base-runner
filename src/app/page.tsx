'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, useConnect } from 'wagmi';
import { usePlayer } from '@/hooks/usePlayer';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });

export default function Home() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  usePlayer();

  // Auto-connect to injected wallet (Base app) in background
  useEffect(() => {
    if (isConnected) return;
    const hasInjectedProvider = typeof window !== 'undefined' && 'ethereum' in window;
    const injected = connectors.find(c => c.type === 'injected');
    if (hasInjectedProvider && injected) {
      connect({ connector: injected });
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      const mockConnector = connectors.find(c => c.type === 'mock');
      if (mockConnector) connect({ connector: mockConnector });
    }
  }, [isConnected, connect, connectors]);

  // Always show the game — don't gate behind wallet connection
  return <Game />;
}
