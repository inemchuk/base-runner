// ── Automatic Base App notification triggers ───────────────────────────────
// Event-driven engagement notifications. Every entry point here is fire-and-
// forget: callers run these inside `after()` and a failure must never affect
// the originating request.

import { sendBaseNotification } from './baseNotifications';

const OVERTAKE_MAX_RECIPIENTS = 5;
const OVERTAKE_COOLDOWN_SEC = 6 * 3600;

interface RedisLike {
  set(key: string, value: unknown, opts?: unknown): Promise<unknown>;
  zrange(
    key: string,
    min: string | number,
    max: string | number,
    opts?: unknown,
  ): Promise<unknown>;
}

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }) as RedisLike;
}

function notificationsConfigured(): boolean {
  return Boolean(process.env.BASE_NOTIFICATIONS_API_KEY && process.env.NEXT_PUBLIC_APP_URL);
}

/**
 * Notify players who were just overtaken on the all-time leaderboard.
 * Only fires on a genuine improvement (`previousBest > 0`): a first-ever
 * submit passes everyone below it and would spam the whole board.
 */
export async function notifyOvertakenPlayers(opts: {
  address: string;
  previousBest: number;
  score: number;
}): Promise<void> {
  const { address, previousBest, score } = opts;
  if (!notificationsConfigured()) return;
  if (previousBest <= 0 || score <= previousBest) return;

  const redis = await getRedis();
  if (!redis) return;

  // Nearest players strictly between the old and new best (exclusive bounds:
  // ties were not overtaken). rev + byScore returns highest scores first.
  const raw = await redis.zrange('scores', `(${score}`, `(${previousBest}`, {
    byScore: true,
    rev: true,
    offset: 0,
    count: OVERTAKE_MAX_RECIPIENTS + 1,
  });

  const self = address.toLowerCase();
  const candidates = (Array.isArray(raw) ? (raw as string[]) : [])
    .map((a) => a.toLowerCase())
    .filter((a) => a !== self)
    .slice(0, OVERTAKE_MAX_RECIPIENTS);
  if (candidates.length === 0) return;

  // Per-recipient cooldown so an active board doesn't ping the same player
  // every few minutes. SET NX doubles as the "already notified" check.
  const eligible: string[] = [];
  for (const addr of candidates) {
    const fresh = await redis.set(`notify_cd:overtake:${addr}`, '1', {
      ex: OVERTAKE_COOLDOWN_SEC,
      nx: true,
    });
    if (fresh === 'OK') eligible.push(addr);
  }
  if (eligible.length === 0) return;

  await sendBaseNotification({
    walletAddresses: eligible,
    title: 'Someone passed you',
    message: 'You dropped a spot on the Base Runner leaderboard. Jump in and take it back.',
  });
}
