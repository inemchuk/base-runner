import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://baserunnerapp.vercel.app';

export function GET() {
  const h = process.env.FARCASTER_HEADER;
  const p = process.env.FARCASTER_PAYLOAD;
  const s = process.env.FARCASTER_SIGNATURE;

  // Without valid accountAssociation, don't serve a manifest at all —
  // Base app will treat the app as a standard web app.
  if (!h || !p || !s) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json({
    accountAssociation: { header: h, payload: p, signature: s },
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
