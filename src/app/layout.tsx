import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Base Runner',
  description: 'A Crossy Road-style game on Base',
  openGraph: {
    title: 'Base Runner',
    description: 'How far can you go? A Crossy Road-style game on Base.',
    type: 'website',
  },
  other: {
    'base:app_id': '69bd15a3945e0bb74a271ff1',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
