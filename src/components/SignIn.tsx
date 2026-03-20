'use client';

import { useState } from 'react';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { useAccount, useConnect, useSignMessage, usePublicClient } from 'wagmi';

export default function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!isConnected) {
    return (
      <div className="screen">
        <h1 className="game-title">BASE RUNNER</h1>
        <p className="subtitle">connect wallet to play</p>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            className="btn btn-start"
            onClick={() => connect({ connector })}
          >
            {connector.name === 'Injected' ? 'EVM' : connector.name}
          </button>
        ))}
      </div>
    );
  }

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
