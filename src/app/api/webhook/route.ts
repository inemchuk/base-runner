import { NextRequest, NextResponse } from 'next/server';

// Webhook endpoint for Farcaster/Base App frame events
// Called when users add/remove the frame from home screen or toggle notifications
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event } = body;

    // Log event type for debugging (optional)
    console.log('[webhook] event:', event);

    // Handle known event types gracefully
    switch (event) {
      case 'frame_added':
      case 'frame_removed':
      case 'notifications_enabled':
      case 'notifications_disabled':
        break;
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
