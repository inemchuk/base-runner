import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  BADGE_CATEGORIES,
  BADGE_TIERS,
  getBadgeProgress,
  getClaimedByTokenId,
} from '@/lib/badges';

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

// ── GET /api/nft/badges?address=0x.. — badge modal data ────────────────────
// Per category: server progress value + per-tier {target, minted}.
export async function GET(req: NextRequest) {
  try {
    const address = (req.nextUrl.searchParams.get('address') || '').toLowerCase();
    if (!isAddress(address)) {
      return NextResponse.json({ ok: false, error: 'invalid address' }, { status: 400 });
    }

    const redis = await getRedis();
    const [progress, claimed] = await Promise.all([
      getBadgeProgress(redis, address),
      getClaimedByTokenId(address),
    ]);

    const categories = BADGE_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      progress: progress[c.id] || 0,
      tiers: Array.from({ length: BADGE_TIERS }, (_, i) => ({
        tier: i + 1,
        itemId: `badge_${c.id}_${i + 1}`,
        target: c.targets[i],
        minted: Boolean(claimed[c.baseTokenId + i]),
      })),
    }));

    return NextResponse.json({ ok: true, categories });
  } catch (e) {
    console.error('nft/badges error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
