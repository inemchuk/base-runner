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
    const injected = connectors.find(c => c.type === 'injected');
    if (injected) {
      connect({ connector: injected });
    }
  }, [isConnected, connect, connectors]);

  // Always show the game — don't gate behind wallet connection
  return <Game />;
}
