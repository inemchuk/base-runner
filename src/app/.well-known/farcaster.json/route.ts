import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://baserunnerapp.vercel.app';

export function GET() {
  return NextResponse.json({
    accountAssociation: {
      header: process.env.FARCASTER_HEADER || '',
      payload: process.env.FARCASTER_PAYLOAD || '',
      signature: process.env.FARCASTER_SIGNATURE || '',
    },
    frame: {
      version: '1',
      name: 'Base Runner',
      subtitle: 'How far can you go?',
      description: 'On-chain runner game on Base with daily check-ins.',
      iconUrl: `${APP_URL}/icon.png`,
      homeUrl: APP_URL,
      splashImageUrl: `${APP_URL}/splash.png`,
      splashBackgroundColor: '#0050FF',
      primaryCategory: 'games',
      tags: ['game', 'base', 'onchain'],
      webhookUrl: `${APP_URL}/api/webhook`,
    },
  });
}
