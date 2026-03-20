'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { MiniKitProvider } from '@coinbase/onchainkit/minikit';
import { config } from '@/config/wagmi';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider enabled>
          {children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
