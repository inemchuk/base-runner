import { NextRequest, NextResponse } from 'next/server';

type QuestData = Record<string, { progress: number; claimed: boolean[] }>;

const memStore = new Map<string, QuestData>();

// GET /api/quests?address=0x...
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json({ data: null });

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const data = await redis.get(`quests:${address}`) as QuestData | null;
      return NextResponse.json({ data: data || null });
    } else {
      const data = memStore.get(address);
      return NextResponse.json({ data: data || null });
    }
  } catch (e) {
    console.error('quests GET error:', e);
    return NextResponse.json({ data: null });
  }
}

// POST /api/quests { address, data }
export async function POST(req: NextRequest) {
  try {
    const { address, data } = await req.json();
    if (!address || !data) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.set(`quests:${addr}`, data);
    } else {
      memStore.set(addr, data);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('quests POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
