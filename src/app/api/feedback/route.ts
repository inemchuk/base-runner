import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

export const dynamic = 'force-dynamic';

const INBOX_KEY = 'feedback:inbox';
const MAX_INBOX_ENTRIES = 1000;
const RATE_LIMIT_SECONDS = 60;
const TELEGRAM_TIMEOUT_MS = 5000;

type FeedbackKind = 'bug' | 'idea';

type FeedbackEntry = {
  id: string;
  kind: FeedbackKind;
  message: string;
  address: string | null;
  createdAt: number;
};

interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: unknown): Promise<unknown>;
  lpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

let redisClient: RedisLike | null = null;
const memInbox: FeedbackEntry[] = [];
const memRateLimit = new Map<string, number>();

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (redisClient) return redisClient;
  const { Redis } = await import('@upstash/redis');
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }) as RedisLike;
  return redisClient;
}

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_ADMIN_SECRET;
  return Boolean(secret && req.headers.get('x-admin-secret') === secret);
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const message = value.replace(/\u0000/g, '').trim();
  if (message.length < 10 || message.length > 1000) return null;
  return message;
}

function normalizeKind(value: unknown): FeedbackKind | null {
  return value === 'bug' || value === 'idea' ? value : null;
}

function normalizeAddress(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isAddress(value)) return undefined;
  return value.toLowerCase();
}

function rateLimitSubject(req: NextRequest, address: string | null): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  return ip || address || 'anonymous';
}

function rateLimitKey(subject: string): string {
  const digest = createHash('sha256').update(subject).digest('hex').slice(0, 32);
  return `feedback:rate:${digest}`;
}

async function reserveRateLimit(redis: RedisLike | null, subject: string): Promise<boolean> {
  const key = rateLimitKey(subject);
  if (redis) return (await redis.set(key, '1', { ex: RATE_LIMIT_SECONDS, nx: true })) === 'OK';

  const now = Date.now();
  const previous = memRateLimit.get(key) || 0;
  if (previous > now) return false;
  memRateLimit.set(key, now + RATE_LIMIT_SECONDS * 1000);
  return true;
}

async function appendFeedback(redis: RedisLike | null, entry: FeedbackEntry): Promise<void> {
  if (redis) {
    await redis.lpush(INBOX_KEY, JSON.stringify(entry));
    await redis.ltrim(INBOX_KEY, 0, MAX_INBOX_ENTRIES - 1);
    return;
  }
  memInbox.unshift(entry);
  if (memInbox.length > MAX_INBOX_ENTRIES) memInbox.length = MAX_INBOX_ENTRIES;
}

async function readFeedback(redis: RedisLike | null, limit: number): Promise<FeedbackEntry[]> {
  if (!redis) return memInbox.slice(0, limit);
  const raw = await redis.lrange(INBOX_KEY, 0, limit - 1);
  return raw.flatMap((item) => {
    try {
      const parsed = JSON.parse(item) as FeedbackEntry;
      return parsed && typeof parsed.message === 'string' ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_FEEDBACK_BOT_TOKEN && process.env.TELEGRAM_FEEDBACK_CHAT_ID);
}

async function sendTelegramFeedback(entry: FeedbackEntry): Promise<void> {
  const token = process.env.TELEGRAM_FEEDBACK_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID;
  if (!token || !chatId) return;

  const typeLabel = entry.kind === 'bug' ? 'BUG REPORT' : 'PLAYER IDEA';
  const wallet = entry.address || 'not connected';
  const text = [
    'BASE RUNNER FEEDBACK',
    typeLabel,
    '',
    entry.message,
    '',
    `Wallet: ${wallet}`,
    `ID: ${entry.id}`,
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram send failed (${response.status})`);
  const body = await response.json().catch(() => null);
  if (!body?.ok) throw new Error('Telegram send failed (invalid response)');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = normalizeKind(body?.kind);
    const message = normalizeMessage(body?.message);
    const address = normalizeAddress(body?.address);
    if (!kind || !message || address === undefined) {
      return NextResponse.json({ ok: false, error: 'invalid_feedback' }, { status: 400 });
    }
    if (!telegramConfigured()) {
      return NextResponse.json({ ok: false, error: 'telegram_unavailable' }, { status: 503 });
    }

    const redis = await getRedis();
    const allowed = await reserveRateLimit(redis, rateLimitSubject(req, address));
    if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

    const entry: FeedbackEntry = {
      id: randomUUID(),
      kind,
      message,
      address,
      createdAt: Date.now(),
    };
    await appendFeedback(redis, entry);

    try {
      await sendTelegramFeedback(entry);
    } catch (error) {
      console.error('feedback telegram notification failed:', error);
      return NextResponse.json({ ok: false, error: 'telegram_delivery_failed' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: entry.id });
  } catch (error) {
    console.error('feedback POST error:', error);
    return NextResponse.json({ ok: false, error: 'feedback_unavailable' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  try {
    const rawLimit = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Math.min(100, Math.max(1, Math.floor(rawLimit) || 50));
    const entries = await readFeedback(await getRedis(), limit);
    return NextResponse.json(
      { ok: true, entries },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('feedback GET error:', error);
    return NextResponse.json({ ok: false, error: 'feedback_unavailable' }, { status: 500 });
  }
}
