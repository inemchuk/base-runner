import { NextRequest, NextResponse } from 'next/server';

const memStore = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { address, score } = await req.json();

    if (!address || typeof score !== 'number' || score <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      // GT: сохраняет только если новый скор > текущий
      const current = await redis.zscore('scores', addr);
      if (!current || score > Number(current)) {
        await redis.zadd('scores', { score, member: addr });
      }
    } else {
      const current = memStore.get(addr) ?? 0;
      if (score > current) {
        memStore.set(addr, score);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('score/submit error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
