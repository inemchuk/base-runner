import { NextResponse } from 'next/server';

export async function GET() {
  try {
    let raw: Array<{ address: string; balance: number }> = [];

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      // zrange с rev:true возвращает [member, score, member, score, ...]
      const result = await redis.zrange('coin_lb', 0, 19, { rev: true, withScores: true }) as (string | number)[];
      for (let i = 0; i < result.length; i += 2) {
        raw.push({ address: result[i] as string, balance: result[i + 1] as number });
      }
    }

    return NextResponse.json({ entries: raw });
  } catch (e) {
    console.error('coins/leaderboard error:', e);
    return NextResponse.json({ entries: [] });
  }
}
