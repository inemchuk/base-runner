import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const SECRET = process.env.ANTI_CHEAT_SECRET ?? 'dev_secret_change_in_prod';

// POST /api/score/session { address }
// Returns a signed token to be included with score submission.
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ error: 'no address' }, { status: 400 });

    const addr      = (address as string).toLowerCase();
    const issuedAt  = Date.now();
    const payload   = `${addr}:${issuedAt}`;
    const sig       = createHmac('sha256', SECRET).update(payload).digest('hex');
    const token     = Buffer.from(`${payload}:${sig}`).toString('base64url');

    return NextResponse.json({ token });
  } catch (e) {
    console.error('score/session error:', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
