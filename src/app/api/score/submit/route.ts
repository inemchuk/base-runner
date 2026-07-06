import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { updateLevelProgressFromRun } from '@/lib/economy/levels.ts';
import { updateQuestProgressFromRun } from '@/lib/economy/quests.ts';
import { getRatingDef, getRunRating } from '@/lib/economy/rating.ts';
import {
  readCheckinRewardState,
  readDailyQualityState,
  readLevelState,
  readQuestState,
  writeDailyQualityState,
  writeLevelState,
  writeQuestState,
} from '@/lib/economy/storage.ts';
import { applyDailyQualityRun } from '@/lib/economy/daily-quality.ts';

const SECRET              = process.env.ANTI_CHEAT_SECRET ?? 'dev_secret_change_in_prod';
const MAX_ROWS_PER_SEC    = 5;    // generous upper bound on player speed
const MAX_SESSION_AGE_MS  = 30 * 60 * 1000; // 30 minutes — longest realistic game
const HARD_SCORE_CAP      = 9999;

const memStore = new Map<string, number>();

function isoWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function verifyToken(token: string, address: string): { ok: true; issuedAt: number } | { ok: false; reason: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts   = decoded.split(':');
    if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

    const [tokenAddr, issuedAtStr, sig] = parts;
    const issuedAt = parseInt(issuedAtStr, 10);
    if (isNaN(issuedAt))          return { ok: false, reason: 'bad timestamp' };
    if (tokenAddr !== address)    return { ok: false, reason: 'address mismatch' };

    // Verify HMAC
    const payload  = `${tokenAddr}:${issuedAtStr}`;
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
    if (sig !== expected)         return { ok: false, reason: 'invalid signature' };

    // Check age
    const age = Date.now() - issuedAt;
    if (age < 0)                  return { ok: false, reason: 'token from the future' };
    if (age > MAX_SESSION_AGE_MS) return { ok: false, reason: 'session expired' };

    return { ok: true, issuedAt };
  } catch {
    return { ok: false, reason: 'token parse error' };
  }
}

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

export async function POST(req: NextRequest) {
  try {
    const { address, score, sessionCoins, token } = await req.json();

    if (!address || typeof score !== 'number' || score <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    // ── Hard cap ────────────────────────────────────────────────────────
    if (score > HARD_SCORE_CAP) {
      console.warn(`[anticheat] score ${score} exceeds hard cap for ${addr}`);
      return NextResponse.json({ ok: false, error: 'score_rejected' }, { status: 422 });
    }

    // ── Token validation ────────────────────────────────────────────────
    // In local dev (no secret configured) we skip token check to avoid friction.
    const isProd = process.env.ANTI_CHEAT_SECRET !== undefined;

    if (isProd) {
      if (!token) {
        console.warn(`[anticheat] missing token for ${addr} score=${score}`);
        return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 422 });
      }

      const result = verifyToken(token, addr);
      if (!result.ok) {
        console.warn(`[anticheat] token rejected (${result.reason}) for ${addr} score=${score}`);
        return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 422 });
      }

      // ── Speed plausibility check ─────────────────────────────────────
      const elapsedSec = (Date.now() - result.issuedAt) / 1000;
      const maxPossible = Math.floor(elapsedSec * MAX_ROWS_PER_SEC);
      if (score > maxPossible) {
        console.warn(`[anticheat] impossible speed: score=${score} elapsed=${elapsedSec.toFixed(1)}s max=${maxPossible} addr=${addr}`);
        return NextResponse.json({ ok: false, error: 'score_rejected' }, { status: 422 });
      }
    }

    // ── Persist (best score per period) ─────────────────────────────────
    let previousBest = 0;
    const redis = await getRedis();
    if (redis) {
      const now   = new Date();
      const week  = `scores:week:${now.getUTCFullYear()}-W${isoWeek(now).toString().padStart(2,'0')}`;
      const month = `scores:month:${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;

      // All-time: only update if new personal best
      const current = await redis.zscore('scores', addr);
      previousBest = Math.max(0, Number(current) || 0);
      if (!current || score > Number(current)) {
        await redis.zadd('scores', { score, member: addr });
      }
      // Weekly: only update if best this week
      const curWeek = await redis.zscore(week, addr);
      if (!curWeek || score > Number(curWeek)) {
        await redis.zadd(week,  { score, member: addr });
        await redis.expire(week,  21 * 86400); // keep 3 weeks
      }
      // Monthly: only update if best this month
      const curMonth = await redis.zscore(month, addr);
      if (!curMonth || score > Number(curMonth)) {
        await redis.zadd(month, { score, member: addr });
        await redis.expire(month, 93 * 86400); // keep 3 months
      }
    } else {
      const current = memStore.get(addr) ?? 0;
      previousBest = Math.max(0, Number(current) || 0);
      if (score > current) memStore.set(addr, score);
    }

    const [questState, levelState, checkinRewardState, dailyQualityState] = await Promise.all([
      readQuestState(addr),
      readLevelState(addr),
      readCheckinRewardState(addr),
      readDailyQualityState(addr),
    ]);
    const rating = getRunRating(score);
    const ratingDef = getRatingDef(rating);
    const dailyQualityUpdate = applyDailyQualityRun(dailyQualityState, rating);
    const nextQuestState = updateQuestProgressFromRun(questState, { score, sessionCoins, rating });
    const levelUpdate = updateLevelProgressFromRun(levelState, {
      score,
      sessionCoins,
      checkinStreak: checkinRewardState.streak,
      isNewRecord: score > previousBest,
      extraXp: dailyQualityUpdate.xpDelta,
    });

    await Promise.all([
      writeQuestState(addr, nextQuestState),
      writeLevelState(addr, levelUpdate.state),
      writeDailyQualityState(addr, dailyQualityUpdate.state),
    ]);

    return NextResponse.json({
      ok: true,
      quests: nextQuestState,
      levels: levelUpdate.state,
      rating: { id: ratingDef.id, label: ratingDef.label },
      dailyQuality: {
        xpDelta: dailyQualityUpdate.xpDelta,
        claimedXp: dailyQualityUpdate.state.claimedXp,
        bestRating: dailyQualityUpdate.state.bestRating,
      },
      xp: {
        earned: levelUpdate.xpEarned,
        breakdown: levelUpdate.breakdown,
      },
      levelUps: levelUpdate.levelUps,
    });
  } catch (e) {
    console.error('score/submit error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
