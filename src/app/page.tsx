'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import Game from '@/components/Game';
import SignIn from '@/components/SignIn';
import { usePlayer } from '@/hooks/usePlayer';

export default function Home() {
  const { isConnected } = useAccount();
  const [isAuthed, setIsAuthed] = useState(false);
  usePlayer();

  if (!isConnected || !isAuthed) {
    return <SignIn onSuccess={() => setIsAuthed(true)} />;
  }

  return <Game />;
}
