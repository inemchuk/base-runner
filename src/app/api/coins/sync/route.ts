import { NextRequest, NextResponse } from 'next/server';
import { writeCoins } from '@/lib/economy/storage.ts';

export async function POST(req: NextRequest) {
  try {
    const { address, balance } = await req.json();

    if (!address || typeof balance !== 'number' || balance < 0) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    await writeCoins(address as string, balance);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('coins/sync error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
