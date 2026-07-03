import { NextRequest, NextResponse } from 'next/server';
import { mergeClientShop, readShop } from '@/lib/economy/storage.ts';
import { normalizeShopData } from '@/lib/economy/core.ts';

// GET /api/shop?address=0x…
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json(normalizeShopData());
    return NextResponse.json(await readShop(address));
  } catch (e) {
    console.error('shop GET error:', e);
    return NextResponse.json(normalizeShopData());
  }
}

// POST /api/shop
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body;
    if (!address) return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });

    const shopData = await mergeClientShop(address as string, {
      owned:          body.owned,
      equipped:       body.equipped,
      boosterCharges: body.boosterCharges,
      trailPacks:     body.trailPacks,
      equippedTrail:  body.equippedTrail,
      equippedDeath:  body.equippedDeath,
      deathPacks:     body.deathPacks,
    });

    return NextResponse.json({ ok: true, shop: shopData });
  } catch (e) {
    console.error('shop POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
