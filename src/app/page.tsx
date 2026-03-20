'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import { useMiniKit, useAddFrame } from '@coinbase/onchainkit/minikit';
import SignIn from '@/components/SignIn';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });
import { usePlayer } from '@/hooks/usePlayer';

export default function Home() {
  const { isConnected } = useAccount();
  const [isAuthed, setIsAuthed] = useState(false);
  const { context, isFrameReady, setFrameReady } = useMiniKit();
  const addFrame = useAddFrame();
  usePlayer();

  // Signal to Base App that the frame is ready
  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [isFrameReady, setFrameReady]);

  // Auto-prompt to add to home screen after 3s (only if not already added)
  useEffect(() => {
    if (!isConnected || !isAuthed) return;
    if (context?.client.added) return;
    const timer = setTimeout(() => addFrame(), 3000);
    return () => clearTimeout(timer);
  }, [isConnected, isAuthed, context, addFrame]);

  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  if (!isDev && (!isConnected || !isAuthed)) {
    return <SignIn onSuccess={() => setIsAuthed(true)} />;
  }

  return <Game />;
}
