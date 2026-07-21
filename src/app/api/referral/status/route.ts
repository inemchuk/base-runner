import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  ensureCode,
  getReferralRedis,
  referralEnabled,
  REFERRAL_BUDGET_CAP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  REFERRAL_REWARD_CENTS,
  REFERRAL_TX_THRESHOLD,
  type ReferralBind,
} from '@/lib/referral';

// ── GET /api/referral/status?address=0x.. — powers the Invite screen ───────
export async function GET(req: NextRequest) {
  try {
    const address = (req.nextUrl.searchParams.get('address') || '').toLowerCase();
    if (!isAddress(address)) {
      return NextResponse.json({ ok: false, error: 'invalid address' }, { status: 400 });
    }

    const redis = await getReferralRedis();
    if (!redis) return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });

    const budgetUsed = Number((await redis.get<number>('referral_budget_used')) || 0);
    const active = referralEnabled() && budgetUsed < REFERRAL_BUDGET_CAP_CENTS;
    if (!active) {
      return NextResponse.json({
        ok: true,
        active: false,
        threshold: REFERRAL_TX_THRESHOLD,
        rewardCents: REFERRAL_REWARD_CENTS,
        payoutMinCents: REFERRAL_PAYOUT_MIN_CENTS,
      });
    }

    const [code, balanceCents, children] = await Promise.all([
      ensureCode(redis, address),
      redis.get<number>(`referral_balance:${address}`).then((v) => Number(v) || 0),
      redis.smembers(`referral_children:${address}`),
    ]);

    const invited: Array<{ address: string; txCount: number; status: string }> = [];
    if (children.length > 0) {
      const [binds, counts] = await Promise.all([
        redis.mget<(ReferralBind | null)[]>(...children.map((a) => `referral_bound:${a}`)),
        redis.mget<(number | null)[]>(...children.map((a) => `referral_tx:${a}`)),
      ]);
      children.forEach((child, i) => {
        invited.push({
          address: child,
          txCount: Math.min(Number(counts[i]) || 0, REFERRAL_TX_THRESHOLD),
          status: binds[i]?.status || 'pending',
        });
      });
      // Qualified first, then by progress.
      invited.sort((a, b) => (b.status > a.status ? 1 : b.status < a.status ? -1 : b.txCount - a.txCount));
    }

    return NextResponse.json({
      ok: true,
      active: true,
      code,
      threshold: REFERRAL_TX_THRESHOLD,
      rewardCents: REFERRAL_REWARD_CENTS,
      payoutMinCents: REFERRAL_PAYOUT_MIN_CENTS,
      balanceCents,
      invited,
    });
  } catch (e) {
    console.error('referral status error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
