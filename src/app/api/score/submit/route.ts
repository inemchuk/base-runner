import { NextRequest, NextResponse, after } from 'next/server';
import { updateLevelProgressFromRun } from '@/lib/economy/levels.ts';
import { notifyOvertakenPlayers } from '@/lib/notificationTriggers.ts';
import { sanitizeRunCoins, updateQuestProgressFromRun } from '@/lib/economy/quests.ts';
import { getRatingDef, getRunRating } from '@/lib/economy/rating.ts';
import {
  isAntiCheatEnabled,
  MAX_SESSION_AGE_MS,
  verifySessionToken,
} from '@/lib/economy/session-token.ts';
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
import { trackEconomyEventAfter } from '@/lib/economy/telemetry.ts';

const MAX_ROWS_PER_SEC    = 5;    // generous upper bound on player speed
const HARD_SCORE_CAP      = 9999;

const memStore = new Map<string, number>();
// Fallback single-use token tracking when Redis is unavailable (dev/edge).
const usedTokens = new Set<string>();

function isoWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
    const redis = await getRedis();

    // ── Hard cap ────────────────────────────────────────────────────────
    if (score > HARD_SCORE_CAP) {
      console.warn(`[anticheat] score ${score} exceeds hard cap for ${addr}`);
      return NextResponse.json({ ok: false, error: 'score_rejected' }, { status: 422 });
    }

    // ── Token validation ────────────────────────────────────────────────
    // In local dev (no secret configured) we skip token check to avoid friction.
    const isProd = isAntiCheatEnabled();

    if (isProd) {
      if (!token) {
        console.warn(`[anticheat] missing token for ${addr} score=${score}`);
        return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 422 });
      }

      const result = verifySessionToken(token, addr);
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

      // ── Single-use enforcement ───────────────────────────────────────
      // Each session token authorizes exactly one credited run. Without this,
      // a still-valid token could be replayed within its 30-min TTL to farm
      // quest progress and XP (which now accrue on every accepted submit).
      const nonceTtl = Math.ceil(MAX_SESSION_AGE_MS / 1000);
      if (redis) {
        const fresh = await redis.set(`score_nonce:${token}`, '1', { ex: nonceTtl, nx: true });
        if (fresh !== 'OK') {
          console.warn(`[anticheat] token replay rejected for ${addr} score=${score}`);
          return NextResponse.json({ ok: false, error: 'token_replayed' }, { status: 409 });
        }
      } else if (usedTokens.has(token)) {
        console.warn(`[anticheat] token replay rejected (mem) for ${addr} score=${score}`);
        return NextResponse.json({ ok: false, error: 'token_replayed' }, { status: 409 });
      } else {
        usedTokens.add(token);
      }
    }

    // ── Persist (best score per period) ─────────────────────────────────
    let previousBest = 0;
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

    // Notify players this run just overtook on the all-time board.
    // Fire-and-forget: must never affect the submit response.
    if (redis && score > previousBest && previousBest > 0) {
      after(() => {
        notifyOvertakenPlayers({ address: addr, previousBest, score }).catch((err) => {
          console.warn('overtake notification failed:', err);
        });
      });
    }

    // Non-blocking telemetry (after() runs post-response). Log the credited
    // (sanitized) coin figure, not the raw request value.
    trackEconomyEventAfter('game_run_completed', addr, {
      score,
      sessionCoins: sanitizeRunCoins(score, sessionCoins),
      rating,
      xpEarned: levelUpdate.xpEarned,
      dailyQualityXp: dailyQualityUpdate.xpDelta,
    });
    if (dailyQualityUpdate.xpDelta > 0) {
      trackEconomyEventAfter('economy_daily_quality_bonus_claimed', addr, {
        rating,
        xpDelta: dailyQualityUpdate.xpDelta,
      });
    }
    if (rating === 'great' || rating === 'elite' || rating === 'master') {
      trackEconomyEventAfter('quest_elite_run_progressed', addr, {
        rating,
        progress: nextQuestState.elite_runs.progress,
      });
    }

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
