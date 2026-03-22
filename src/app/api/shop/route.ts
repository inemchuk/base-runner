import { NextRequest, NextResponse } from 'next/server';

const memStore = new Map<string, { owned: string[]; equipped: string }>();

// GET /api/shop?address=0x...  — загрузить данные шопа
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const data = await redis.get(`shop:${address}`) as { owned: string[]; equipped: string } | null;
      if (data) return NextResponse.json(data);
    } else {
      const data = memStore.get(address);
      if (data) return NextResponse.json(data);
    }

    return NextResponse.json({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });
  } catch (e) {
    console.error('shop GET error:', e);
    return NextResponse.json({ owned: ['skin_cryptokid'], equipped: 'skin_cryptokid' });
  }
}

// POST /api/shop  — сохранить данные шопа
export async function POST(req: NextRequest) {
  try {
    const { address, owned, equipped } = await req.json();
    if (!address || !owned || !equipped) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();
    const shopData = { owned, equipped };

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      await redis.set(`shop:${addr}`, shopData);
    } else {
      memStore.set(addr, shopData);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('shop POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
