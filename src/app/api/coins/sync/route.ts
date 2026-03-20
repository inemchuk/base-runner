import { NextRequest, NextResponse } from 'next/server';

// In-memory fallback для локальной разработки
const memStore = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { address, balance } = await req.json();

    if (!address || typeof balance !== 'number' || balance < 0) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      // Берём максимум — лидерборд показывает пик, а не текущий баланс
      const current = await redis.zscore('coin_lb', addr);
      const best = Math.max(balance, current ?? 0);
      await redis.zadd('coin_lb', { score: best, member: addr });
    } else {
      const current = memStore.get(addr) ?? 0;
      memStore.set(addr, Math.max(balance, current));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('coins/sync error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
