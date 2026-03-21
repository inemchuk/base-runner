'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import SignIn from '@/components/SignIn';
import { usePlayer } from '@/hooks/usePlayer';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });

export default function Home() {
  const { isConnected } = useAccount();
  const [isAuthed, setIsAuthed] = useState(false);
  usePlayer();

  // Signal to Base App that the frame is ready (hides splash screen)
  useEffect(() => {
    import('@farcaster/miniapp-sdk').then(({ sdk }) => {
      sdk.actions.ready({ disableNativeGestures: true }).catch(() => {});
    }).catch(() => {});
  }, []);

  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && (!isConnected || !isAuthed)) {
    return <SignIn onSuccess={() => setIsAuthed(true)} />;
  }

  return <Game />;
}
