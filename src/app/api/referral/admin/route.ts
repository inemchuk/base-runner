import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  getReferralRedis,
  REFERRAL_BUDGET_CAP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  type ReferralBind,
} from '@/lib/referral';

// ── /api/referral/admin — payout operations (manual weekly batch) ──────────
// Auth: `x-admin-secret` = NOTIFY_ADMIN_SECRET (same as /api/notify).
// GET  — list referrers with balance >= payout minimum, with their children.
// POST — record a completed payout: { address, txHash, amountCents } →
//        decrements the balance and appends a payout record.

function authorized(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_ADMIN_SECRET;
  return Boolean(secret && req.headers.get('x-admin-secret') === secret);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const redis = await getReferralRedis();
    if (!redis) return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });

    // Referrers are discoverable through the pending/children sets: keep an
    // index set of every referrer that ever got a child.
    const referrers = await redis.smembers('referral_referrers');
    const budgetUsed = Number((await redis.get<number>('referral_budget_used')) || 0);

    const payable: Array<{
      address: string;
      balanceCents: number;
      children: Array<{ address: string; txCount: number; status: string }>;
    }> = [];

    for (const referrer of referrers) {
      const balanceCents = Number((await redis.get<number>(`referral_balance:${referrer}`)) || 0);
      if (balanceCents < REFERRAL_PAYOUT_MIN_CENTS) continue;
      const children = await redis.smembers(`referral_children:${referrer}`);
      const [binds, counts] = children.length
        ? await Promise.all([
            redis.mget<(ReferralBind | null)[]>(...children.map((a) => `referral_bound:${a}`)),
            redis.mget<(number | null)[]>(...children.map((a) => `referral_tx:${a}`)),
          ])
        : [[], []];
      payable.push({
        address: referrer,
        balanceCents,
        children: children.map((c, i) => ({
          address: c,
          txCount: Number(counts[i]) || 0,
          status: binds[i]?.status || 'pending',
        })),
      });
    }

    payable.sort((a, b) => b.balanceCents - a.balanceCents);
    return NextResponse.json({
      ok: true,
      budgetUsedCents: budgetUsed,
      budgetCapCents: REFERRAL_BUDGET_CAP_CENTS,
      payable,
    });
  } catch (e) {
    console.error('referral admin GET error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const { address, txHash, amountCents } = await req.json();
    const cents = Math.floor(Number(amountCents) || 0);
    if (
      typeof address !== 'string' || !isAddress(address) ||
      typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash) ||
      cents <= 0
    ) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const redis = await getReferralRedis();
    if (!redis) return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });

    const referrer = address.toLowerCase();
    const balance = Number((await redis.get<number>(`referral_balance:${referrer}`)) || 0);
    if (cents > balance) {
      return NextResponse.json({ ok: false, error: 'amount exceeds balance' }, { status: 409 });
    }

    await Promise.all([
      redis.incrby(`referral_balance:${referrer}`, -cents),
      redis.lpush(
        `referral_payout:${referrer}`,
        JSON.stringify({ txHash, cents, ts: Date.now() }),
      ),
    ]);
    return NextResponse.json({ ok: true, remainingCents: balance - cents });
  } catch (e) {
    console.error('referral admin POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
