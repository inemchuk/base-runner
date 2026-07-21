import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  getReferralRedis,
  qualifyIfReady,
  referralEnabled,
  verifyGameTx,
} from '@/lib/referral';

// ── POST /api/referral/tx — count a verified game transaction ──────────────
// Body: { address, txHash }. Fire-and-forget from the client after any
// successful game tx (check-in, score claim, NFT mint). Every verified tx
// increments the global `game_tx:{addr}` counter (badge track, stats);
// wallets with a pending referral bind additionally advance their referral
// tx count. Hashes are single-use; verification is by receipt logs.
export async function POST(req: NextRequest) {
  try {
    const { address, txHash } = await req.json();
    if (
      typeof address !== 'string' || !isAddress(address) ||
      typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)
    ) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const redis = await getReferralRedis();
    if (!redis) return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });

    const wallet = address.toLowerCase();

    // Reserve the hash before the (slow) RPC check; release on failure so a
    // transient RPC error does not burn the hash forever.
    const fresh = await redis.set(`referral_txseen:${txHash.toLowerCase()}`, wallet, {
      nx: true,
      ex: 90 * 86400,
    });
    if (fresh !== 'OK') return NextResponse.json({ ok: true, counted: false });

    const valid = await verifyGameTx(txHash as `0x${string}`, wallet);
    if (!valid) {
      await redis.set(`referral_txseen:${txHash.toLowerCase()}`, '', { ex: 1 });
      return NextResponse.json({ ok: true, counted: false });
    }

    const totalTx = await redis.incr(`game_tx:${wallet}`);

    // Referral progress only for pending referees while the program is live.
    let referralCount: number | undefined;
    if (referralEnabled()) {
      const bind = await redis.get<{ status?: string }>(`referral_bound:${wallet}`);
      if (bind && bind.status === 'pending') {
        referralCount = await redis.incr(`referral_tx:${wallet}`);
        await qualifyIfReady(redis, wallet);
      }
    }

    return NextResponse.json({ ok: true, counted: true, totalTx, referralCount });
  } catch (e) {
    console.error('referral tx error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
