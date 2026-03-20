import { NextResponse } from 'next/server';

const memStore = new Map<string, number>();

export async function GET() {
  try {
    let raw: Array<{ address: string; balance: number }> = [];

    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      // zrange с rev:true возвращает [member, score, member, score, ...]
      const result = await kv.zrange('coin_lb', 0, 19, { rev: true, withScores: true }) as (string | number)[];
      for (let i = 0; i < result.length; i += 2) {
        raw.push({ address: result[i] as string, balance: result[i + 1] as number });
      }
    } else {
      raw = [...memStore.entries()]
        .map(([address, balance]) => ({ address, balance }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 20);
    }

    return NextResponse.json({ entries: raw });
  } catch (e) {
    console.error('coins/leaderboard error:', e);
    return NextResponse.json({ entries: [] });
  }
}
