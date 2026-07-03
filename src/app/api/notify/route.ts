import { NextRequest, NextResponse } from 'next/server';
import { sendBaseNotification, broadcastBaseNotification } from '@/lib/baseNotifications';

// ── POST /api/notify — send a Base App notification ────────────────────────
// Auth: header `x-admin-secret` must equal NOTIFY_ADMIN_SECRET.
// Body: { title, message, targetPath?, walletAddresses? }
//   - omit walletAddresses to broadcast to all opted-in users.
export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFY_ADMIN_SECRET;
  if (!secret || req.headers.get('x-admin-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { title, message, targetPath, walletAddresses } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ ok: false, error: 'title and message are required' }, { status: 400 });
    }

    if (Array.isArray(walletAddresses) && walletAddresses.length > 0) {
      const results = await sendBaseNotification({ walletAddresses, title, message, targetPath });
      return NextResponse.json({ ok: true, recipients: walletAddresses.length, results });
    }

    const { recipients, results } = await broadcastBaseNotification({ title, message, targetPath });
    return NextResponse.json({ ok: true, recipients, results });
  } catch (e) {
    console.error('notify POST error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
