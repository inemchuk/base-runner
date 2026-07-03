import { NextRequest, NextResponse } from 'next/server';
import { readQuestState } from '@/lib/economy/storage.ts';

// GET /api/quests?address=0x...
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
    if (!address) return NextResponse.json({ data: null });
    return NextResponse.json({ data: await readQuestState(address) });
  } catch (e) {
    console.error('quests GET error:', e);
    return NextResponse.json({ data: null });
  }
}

// POST remains for backward-compatible client sync calls, but no longer trusts
// client-authored quest progress as authoritative economy state.
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      ignored: true,
      data: await readQuestState(address as string),
    });
  } catch (e) {
    console.error('quests POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
