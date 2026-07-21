import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  getReferralRedis,
  referralEnabled,
  REFERRAL_REFEREE_BONUS_COINS,
  REFERRAL_REFEREE_BONUS_BOOSTER,
  type ReferralBind,
} from '@/lib/referral';
import {
  acquireEconomyLock,
  normalizeAddress,
  readCoins,
  readShop,
  releaseEconomyLock,
  writeCoins,
  writeShop,
} from '@/lib/economy/storage.ts';

// ── POST /api/referral/bind — attach a new wallet to a referrer ────────────
// Body: { code, address }. Rules (all enforced): program enabled, code
// resolves, no self-referral, referee is a NEW wallet (no score, no
// check-in), first bind wins forever (SET NX). Grants the one-time referee
// bonus on success. Responds 200 with {bound:false} on any soft failure —
// the client treats this as a silent no-op.
export async function POST(req: NextRequest) {
  try {
    if (!referralEnabled()) return NextResponse.json({ ok: true, bound: false, reason: 'disabled' });

    const { code, address } = await req.json();
    if (typeof code !== 'string' || !code || typeof address !== 'string' || !isAddress(address)) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const redis = await getReferralRedis();
    if (!redis) return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });

    const referee = address.toLowerCase();
    const referrer = await redis.get<string>(`referral_code:${code.toUpperCase()}`);
    if (!referrer || referrer === referee) {
      return NextResponse.json({ ok: true, bound: false, reason: 'bad_code' });
    }

    // New-wallet check: unseen by both the leaderboard and the economy.
    const [scored, checkedIn] = await Promise.all([
      redis.zscore('scores', referee),
      redis.exists(`economy_checkin:${referee}`),
    ]);
    if (scored != null || checkedIn > 0) {
      return NextResponse.json({ ok: true, bound: false, reason: 'not_new' });
    }

    const bind: ReferralBind = { referrer, boundAt: Date.now(), status: 'pending' };
    const fresh = await redis.set(`referral_bound:${referee}`, bind, { nx: true });
    if (fresh !== 'OK') {
      return NextResponse.json({ ok: true, bound: false, reason: 'already_bound' });
    }
    await Promise.all([
      redis.sadd(`referral_children:${referrer}`, referee),
      redis.sadd('referral_pending', referee),
      redis.sadd('referral_referrers', referrer),
    ]);

    // One-time referee bonus (guarded separately so a crash between bind and
    // bonus cannot double-grant on retry).
    const bonusFresh = await redis.set(`referral_bonus:${referee}`, '1', { nx: true });
    if (bonusFresh === 'OK') {
      const lockKey = `economy_lock:referral_bonus:${normalizeAddress(referee)}`;
      if (await acquireEconomyLock(lockKey)) {
        try {
          const [coins, shop] = await Promise.all([readCoins(referee), readShop(referee)]);
          shop.boosterCharges[REFERRAL_REFEREE_BONUS_BOOSTER] =
            (shop.boosterCharges[REFERRAL_REFEREE_BONUS_BOOSTER] || 0) + 1;
          await Promise.all([
            writeCoins(referee, coins + REFERRAL_REFEREE_BONUS_COINS),
            writeShop(referee, shop),
          ]);
        } finally {
          await releaseEconomyLock(lockKey);
        }
      }
    }

    return NextResponse.json({ ok: true, bound: true });
  } catch (e) {
    console.error('referral bind error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
