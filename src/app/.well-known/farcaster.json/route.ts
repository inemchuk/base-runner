import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://baserunnerapp.vercel.app';

export function GET() {
  const manifest: Record<string, unknown> = {
    accountAssociation: {
      header: "eyJmaWQiOjMwNzMxNjcsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgyN2FBRkMyZDYxNDlCRThkRENkZTBhQzA5NmI1Y2VmMDk0NENDNDQzIn0",
      payload: "eyJkb21haW4iOiJiYXNlcnVubmVyYXBwLnZlcmNlbC5hcHAifQ",
      signature: "ewbOm9wjCZZbgKpZBwvG0FBwBZ0e6E2EmHUqqV_8pUFYuvuqFMCywvnBkhvD1Goo0Rl8eMoGvwumyS0kE2B6_xs",
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
  };

  return NextResponse.json(manifest);
}
