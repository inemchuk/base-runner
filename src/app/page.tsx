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

  // Auto-connect to injected wallet (Base app)
  useEffect(() => {
    if (isConnected) return;
    const injected = connectors.find(c => c.type === 'injected');
    if (injected) {
      connect({ connector: injected });
    }
  }, [isConnected, connect, connectors]);

  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && !isConnected) {
    return (
      <div className="screen">
        <h1 className="game-title">BASE RUNNER</h1>
        <p className="subtitle">Connecting...</p>
        <a
          href="https://base.org/app"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-start"
          style={{ textDecoration: 'none', textAlign: 'center', marginTop: '20px' }}
        >
          Open Base App
        </a>
      </div>
    );
  }

  return <Game />;
}
