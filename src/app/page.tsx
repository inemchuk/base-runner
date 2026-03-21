'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import SignIn from '@/components/SignIn';
import { usePlayer } from '@/hooks/usePlayer';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });

export default function Home() {
  const { isConnected } = useAccount();
  const [isAuthed, setIsAuthed] = useState(false);
  usePlayer();

  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && (!isConnected || !isAuthed)) {
    return <SignIn onSuccess={() => setIsAuthed(true)} />;
  }

  return <Game />;
}
