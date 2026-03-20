'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import SignIn from '@/components/SignIn';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });
import { usePlayer } from '@/hooks/usePlayer';

export default function Home() {
  const { isConnected } = useAccount();
  const [isAuthed, setIsAuthed] = useState(false);
  const { isFrameReady, setFrameReady } = useMiniKit();
  usePlayer();

  // Signal to Base App that the frame is ready (hides splash screen)
  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  if (!isDev && (!isConnected || !isAuthed)) {
    return <SignIn onSuccess={() => setIsAuthed(true)} />;
  }

  return <Game />;
}
