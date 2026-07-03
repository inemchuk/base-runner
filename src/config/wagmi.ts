import { http, fallback, createConfig, createStorage, cookieStorage } from 'wagmi';
import { base } from 'wagmi/chains';
import { baseAccount, injected, mock } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(),
    baseAccount({
      appName: 'Base Runner',
    }),
    ...(process.env.NODE_ENV !== 'production'
      ? [mock({ accounts: ['0x1111111111111111111111111111111111111111'] })]
      : []),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [base.id]: fallback([
      http('https://mainnet.base.org'),
      http('https://base.llamarpc.com'),
      http('https://base-rpc.publicnode.com'),
    ]),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
