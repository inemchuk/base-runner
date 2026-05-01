import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const SECRET              = process.env.ANTI_CHEAT_SECRET ?? 'dev_secret_change_in_prod';
const MAX_ROWS_PER_SEC    = 5;    // generous upper bound on player speed
const MAX_SESSION_AGE_MS  = 30 * 60 * 1000; // 30 minutes — longest realistic game
const HARD_SCORE_CAP      = 9999;

const memStore = new Map<string, number>();

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
    const { address, score, token } = await req.json();

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

    // ── Persist (best score only) ────────────────────────────────────────
    const redis = await getRedis();
    if (redis) {
      const current = await redis.zscore('scores', addr);
      if (!current || score > Number(current)) {
        await redis.zadd('scores', { score, member: addr });
      }
    } else {
      const current = memStore.get(addr) ?? 0;
      if (score > current) memStore.set(addr, score);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('score/submit error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
