'use client';

import { useState, useEffect } from 'react';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { useAccount, useConnect, useSignMessage, usePublicClient } from 'wagmi';

export default function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  // Auto-connect to injected wallet (Base app)
  useEffect(() => {
    if (isConnected) return;
    const injected = connectors.find(c => c.type === 'injected');
    if (injected) {
      connect({ connector: injected }, {
        onError: () => setNoWallet(true),
      });
    } else {
      // No injected wallet = not in Base app
      const timer = setTimeout(() => setNoWallet(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, connect, connectors]);

  async function handleSignIn() {
    if (!isConnected || !address || !chainId || !publicClient) return;

    setIsSigningIn(true);
    setError(null);

    try {
      const nonce = generateSiweNonce();
      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
      });

      const signature = await signMessageAsync({ message });
      const valid = await publicClient.verifySiweMessage({ message, signature });
      if (!valid) throw new Error('Signature verification failed');
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  }

  // No injected wallet — not inside Base app
  if (noWallet && !isConnected) {
    return (
      <div className="screen">
        <h1 className="game-title">BASE RUNNER</h1>
        <p className="subtitle" style={{ marginBottom: '16px' }}>
          Play in the Base app
        </p>
        <a
          href="https://base.org/app"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-start"
          style={{ textDecoration: 'none', textAlign: 'center' }}
        >
          Open Base App
        </a>
      </div>
    );
  }

  // Connecting...
  if (!isConnected) {
    return (
      <div className="screen">
        <h1 className="game-title">BASE RUNNER</h1>
        <p className="subtitle">Connecting...</p>
      </div>
    );
  }

  // Connected — sign in
  return (
    <div className="screen">
      <h1 className="game-title">BASE RUNNER</h1>
      <p className="subtitle" style={{ marginBottom: '16px' }}>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </p>
      <button
        className="btn btn-start"
        onClick={handleSignIn}
        disabled={isSigningIn}
      >
        {isSigningIn ? 'Signing...' : '▶ SIGN IN & PLAY'}
      </button>
      {error && (
        <p style={{ color: '#E53935', fontSize: '0.8rem', marginTop: '12px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
