import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://baserunnerapp.vercel.app';

export function GET() {
  const h = process.env.FARCASTER_HEADER;
  const p = process.env.FARCASTER_PAYLOAD;
  const s = process.env.FARCASTER_SIGNATURE;

  // Only include accountAssociation if all env vars are set (non-empty)
  const hasAssociation = h && p && s;

  const manifest: Record<string, unknown> = {
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
  };

  if (hasAssociation) {
    manifest.accountAssociation = { header: h, payload: p, signature: s };
  }

  return NextResponse.json(manifest);
}
