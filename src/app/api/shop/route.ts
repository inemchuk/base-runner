import { NextRequest, NextResponse } from 'next/server';

interface ShopData { owned: string[]; equipped: string; boosters: string[] }

const DEFAULTS: ShopData = { owned: ['skin_cryptokid'], equipped: 'skin_cryptokid', boosters: [] };
const memStore = new Map<string, ShopData>();

// GET /api/shop?address=0x...  — загрузить данные шопа
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json(DEFAULTS);

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const data = await redis.get(`shop:${address}`) as ShopData | null;
      if (data) return NextResponse.json({ ...DEFAULTS, ...data });
    } else {
      const data = memStore.get(address);
      if (data) return NextResponse.json(data);
    }

    return NextResponse.json(DEFAULTS);
  } catch (e) {
    console.error('shop GET error:', e);
    return NextResponse.json(DEFAULTS);
  }
}

// POST /api/shop  — сохранить данные шопа
export async function POST(req: NextRequest) {
  try {
    const { address, owned, equipped, boosters } = await req.json();
    if (!address || !owned || !equipped) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();
    const shopData: ShopData = { owned, equipped, boosters: boosters || [] };

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
