import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Base Runner',
  description: 'On-chain runner game on Base where you dodge obstacles and beat your record. Check in daily to build your streak and collect coins to unlock characters',
  openGraph: {
    title: 'Base Runner',
    description: 'On-chain runner game on Base where you dodge obstacles and beat your record. Check in daily to build your streak and collect coins to unlock characters',
    type: 'website',
    url: 'https://baserunnerapp.vercel.app',
    images: [
      {
        url: 'https://baserunnerapp.vercel.app/og-image.png',
        width: 1200,
        height: 628,
        alt: 'Base Runner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Base Runner',
    description: 'On-chain runner game on Base where you dodge obstacles and beat your record. Check in daily to build your streak and collect coins to unlock characters',
    images: ['https://baserunnerapp.vercel.app/og-image.png'],
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
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Shared rating thresholds — beforeInteractive must live in the root
            layout per Next.js docs; game.js (afterInteractive) reads the global. */}
        <Script src="/game/generated/rating-config.js" strategy="beforeInteractive" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
