import { NextRequest, NextResponse } from 'next/server';
import { fetchOptedInAddresses, sendBaseNotification } from '@/lib/baseNotifications';
import { getReferralRedis, qualifyIfReady, referralEnabled } from '@/lib/referral';

// ── GET /api/notify/cron — daily engagement notifications ──────────────────
// Invoked by Vercel Cron (see vercel.json). Auth: `Authorization: Bearer
// ${CRON_SECRET}` (set automatically on cron invocations), or
// `x-admin-secret: NOTIFY_ADMIN_SECRET` for manual testing.
//
// One opted-in fetch (keeps us well inside Base's 20 req/min), then each
// wallet is assigned to at most ONE segment by priority so nobody gets two
// pushes in a day:
//   1. Streak reminder  — active check-in streak, not yet checked in today.
//   2. Check-in nudge   — never checked in at all.
//   3. First-run nudge  — checked in but never posted a leaderboard score.
//
// `?dryRun=1` returns recipient counts without sending or claiming cooldowns.

const MGET_CHUNK = 100;
const REMINDER_COOLDOWN_SEC = 14 * 24 * 3600;

interface CheckinState {
  lastDate?: string | null;
  streak?: number;
  total?: number;
}

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

type Redis = NonNullable<Awaited<ReturnType<typeof getRedis>>>;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return true;
  const adminSecret = process.env.NOTIFY_ADMIN_SECRET;
  if (adminSecret && req.headers.get('x-admin-secret') === adminSecret) return true;
  return false;
}

function hasCheckedIn(state: CheckinState | null): boolean {
  return !!state && (state.lastDate != null || Math.floor(Number(state.total) || 0) > 0);
}

/** economy_checkin state for every opted-in wallet, keyed by address. */
async function readCheckinStates(redis: Redis, optedIn: string[]): Promise<Map<string, CheckinState | null>> {
  const map = new Map<string, CheckinState | null>();
  for (let i = 0; i < optedIn.length; i += MGET_CHUNK) {
    const chunk = optedIn.slice(i, i + MGET_CHUNK);
    const states = await redis.mget<(CheckinState | null)[]>(
      ...chunk.map((addr) => `economy_checkin:${addr}`),
    );
    chunk.forEach((addr, idx) => map.set(addr, states[idx] ?? null));
  }
  return map;
}

/**
 * Drop wallets currently on this segment's cooldown, then claim the cooldown
 * for the rest (unless dryRun). `kind` namespaces the cooldown key.
 */
async function applyCooldown(
  redis: Redis,
  addrs: string[],
  kind: string,
  dryRun: boolean,
): Promise<string[]> {
  if (addrs.length === 0) return [];
  const eligible: string[] = [];
  for (let i = 0; i < addrs.length; i += MGET_CHUNK) {
    const chunk = addrs.slice(i, i + MGET_CHUNK);
    const seen = await redis.mget<(string | null)[]>(
      ...chunk.map((addr) => `notify_cd:${kind}:${addr}`),
    );
    chunk.forEach((addr, idx) => {
      if (!seen[idx]) eligible.push(addr);
    });
  }
  if (!dryRun) {
    for (const addr of eligible) {
      await redis.set(`notify_cd:${kind}:${addr}`, '1', { ex: REMINDER_COOLDOWN_SEC });
    }
  }
  return eligible;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  try {
    const redis = await getRedis();
    if (!redis) {
      return NextResponse.json({ ok: false, error: 'redis unavailable' }, { status: 503 });
    }

    const optedIn = await fetchOptedInAddresses();
    if (optedIn.length === 0) {
      return NextResponse.json({ ok: true, dryRun, optedIn: 0, streak: 0, checkin: 0, onboarding: 0 });
    }

    const checkinStates = await readCheckinStates(redis, optedIn);
    const players = new Set(
      ((await redis.zrange('scores', 0, -1)) as string[]).map((a) => String(a).toLowerCase()),
    );
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Assign each wallet to at most one segment by priority.
    const streakRaw: string[] = [];
    const checkinRaw: string[] = [];
    const onboardRaw: string[] = [];
    for (const addr of optedIn) {
      const state = checkinStates.get(addr) ?? null;
      const streak = Math.floor(Number(state?.streak) || 0);
      if (streak > 0 && state?.lastDate === yesterday) {
        streakRaw.push(addr);
      } else if (!hasCheckedIn(state)) {
        checkinRaw.push(addr);
      } else if (!players.has(addr)) {
        onboardRaw.push(addr);
      }
    }

    // Streak is time-sensitive and fires daily (Base dedupes identical sends
    // within 24h); the two conversion nudges use a 14-day cooldown.
    const streak = streakRaw;
    const checkin = await applyCooldown(redis, checkinRaw, 'checkin', dryRun);
    const onboarding = await applyCooldown(redis, onboardRaw, 'onboard', dryRun);

    const sends: Record<string, unknown> = {};
    if (!dryRun) {
      if (streak.length > 0) {
        sends.streak = await sendBaseNotification({
          walletAddresses: streak,
          title: 'Your streak ends tonight',
          message: 'Check in before midnight UTC to keep your Base Runner streak alive.',
        });
      }
      if (checkin.length > 0) {
        sends.checkin = await sendBaseNotification({
          walletAddresses: checkin,
          title: 'Start your check-in streak',
          message: 'Base Runner has a free daily check-in with rewards. Tap in to start your streak.',
        });
      }
      if (onboarding.length > 0) {
        sends.onboarding = await sendBaseNotification({
          walletAddresses: onboarding,
          title: "You haven't played yet",
          message: "You've got Base Runner pinned but never made a run. Give it a shot.",
        });
      }
    }

    // Referral qualification sweep — safety net for referees whose eager
    // qualification in /api/referral/tx did not land (transient errors).
    let referralQualified = 0;
    if (referralEnabled() && !dryRun) {
      try {
        const refRedis = await getReferralRedis();
        if (refRedis) {
          const pending = await refRedis.smembers('referral_pending');
          for (const referee of pending) {
            if (await qualifyIfReady(refRedis, referee)) referralQualified++;
          }
        }
      } catch (e) {
        console.warn('referral sweep failed:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      optedIn: optedIn.length,
      streak: streak.length,
      checkin: checkin.length,
      onboarding: onboarding.length,
      referralQualified,
      ...(dryRun ? {} : { sends }),
    });
  } catch (e) {
    console.error('notify cron error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
