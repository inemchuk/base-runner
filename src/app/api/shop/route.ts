import { NextRequest, NextResponse } from 'next/server';

interface ShopData {
  owned:      string[];   // skin IDs
  equipped:   string;
  boosters:   string[];
  trailPacks: string[];   // trail IDs
}

const DEFAULTS: ShopData = {
  owned:      ['skin_cryptokid'],
  equipped:   'skin_cryptokid',
  boosters:   [],
  trailPacks: [],
};

const memStore = new Map<string, ShopData>();

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

// GET /api/shop?address=0x…
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json(DEFAULTS);

    const redis = await getRedis();
    const data  = redis
      ? (await redis.get<ShopData>(`shop:${address}`))
      : memStore.get(address) ?? null;

    return NextResponse.json({ ...DEFAULTS, ...(data ?? {}) });
  } catch (e) {
    console.error('shop GET error:', e);
    return NextResponse.json(DEFAULTS);
  }
}

// POST /api/shop
export async function POST(req: NextRequest) {
  try {
    const { address, owned, equipped, boosters, trailPacks } = await req.json();
    if (!address || !owned || !equipped) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr: string = (address as string).toLowerCase();
    const shopData: ShopData = {
      owned,
      equipped,
      boosters:   boosters   ?? [],
      trailPacks: trailPacks ?? [],
    };

    const redis = await getRedis();
    if (redis) await redis.set(`shop:${addr}`, shopData);
    else        memStore.set(addr, shopData);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('shop POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
