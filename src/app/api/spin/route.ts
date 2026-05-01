import { NextRequest, NextResponse } from 'next/server';
import { spinCost } from '@/config/spin-contract';

// ── Prize pool (server picks, never client) ───────────────────────────────
const PRIZES = [
  // Coins
  { type: 'coins',   value: 10,               weight: 25, label: '10 Coins',      icon: '🪙' },
  { type: 'coins',   value: 25,               weight: 20, label: '25 Coins',      icon: '🪙' },
  { type: 'coins',   value: 50,               weight: 13, label: '50 Coins',      icon: '💰' },
  { type: 'coins',   value: 100,              weight: 7,  label: '100 Coins',     icon: '💰' },
  // Boosters
  { type: 'booster', value: 'boost_magnet',   weight: 8,  label: 'Coin Magnet',   icon: '🧲' },
  { type: 'booster', value: 'boost_double',   weight: 7,  label: 'Double Coins',  icon: '💰' },
  { type: 'booster', value: 'boost_shield',   weight: 6,  label: 'Second Chance', icon: '🛡️' },
  // Trails (rarer)
  { type: 'trail',   value: 'trail_sparkle',  weight: 4,  label: 'Sparkle Trail', icon: '✨' },
  { type: 'trail',   value: 'trail_hearts',   weight: 3,  label: 'Hearts Trail',  icon: '💖' },
  { type: 'trail',   value: 'trail_fire',     weight: 3,  label: 'Fire Trail',    icon: '🔥' },
  { type: 'trail',   value: 'trail_coins',    weight: 2,  label: 'Coins Trail',   icon: '🪙' },
  { type: 'trail',   value: 'trail_rainbow',  weight: 1,  label: 'Rainbow Trail', icon: '🌈' },
  // Skins (rare)
  { type: 'skin', value: 'skin_street_runner', weight: 3, label: 'Street Runner', icon: '🏃' },
  { type: 'skin', value: 'skin_default',        weight: 2, label: 'Builder',      icon: '👷' },
  { type: 'skin', value: 'skin_founder',         weight: 1, label: 'Founder',     icon: '🏗️' },
] as const;

type Prize = typeof PRIZES[number];

function todayUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function nextUTCMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function pickPrize(): Prize {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) { r -= p.weight; if (r <= 0) return p; }
  return PRIZES[0];
}

// In-memory fallback for local dev (no Redis)
const memSpinCount = new Map<string, number>(); // addr → spinsToday
const memSpinDate  = new Map<string, string>();  // addr → date string
const memPrize     = new Map<string, Prize>();   // addr → last prize

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

// ── GET /api/spin?address=0x… — spin count + next cost ───────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
  const nextAt  = nextUTCMidnight();

  if (!address) return NextResponse.json({ spinsToday: 0, nextCost: 0, nextAt });

  const today = todayUTC();
  const redis  = await getRedis();

  let spinsToday = 0;
  if (redis) {
    spinsToday = (await redis.get<number>(`spin_count:${address}:${today}`)) ?? 0;
  } else {
    spinsToday = memSpinDate.get(address) === today ? (memSpinCount.get(address) ?? 0) : 0;
  }

  return NextResponse.json({ spinsToday, nextCost: spinCost(spinsToday), nextAt });
}

// ── POST /api/spin { address } — deduct coins if paid, award prize ────────
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ ok: false, error: 'no address' }, { status: 400 });

    const addr   = (address as string).toLowerCase();
    const today  = todayUTC();
    const redis  = await getRedis();
    const ttlSec = Math.ceil((nextUTCMidnight() - Date.now()) / 1000) + 120;

    // ── How many spins done today? ───────────────────────────────────────
    let spinsToday = 0;
    if (redis) {
      spinsToday = (await redis.get<number>(`spin_count:${addr}:${today}`)) ?? 0;
    } else {
      spinsToday = memSpinDate.get(addr) === today ? (memSpinCount.get(addr) ?? 0) : 0;
    }

    const cost = spinCost(spinsToday);

    // ── Deduct coins for paid spins (Redis only; local dev skips check) ──
    if (cost > 0 && redis) {
      const balance: number = (await redis.get<number>(`coin_balance:${addr}`)) ?? 0;
      if (balance < cost) {
        return NextResponse.json(
          { ok: false, error: 'insufficient_coins', cost, balance },
          { status: 402 },
        );
      }
      const newBalance = balance - cost;
      await redis.set(`coin_balance:${addr}`, newBalance);
      const lbScore = (await redis.zscore('coin_lb', addr)) ?? 0;
      await redis.zadd('coin_lb', { score: Math.max(newBalance, Number(lbScore)), member: addr });
    }

    // ── Pick prize ───────────────────────────────────────────────────────
    const prize         = pickPrize();
    const newSpinsToday = spinsToday + 1;

    if (redis) {
      await redis.set(`spin_count:${addr}:${today}`, newSpinsToday, { ex: ttlSec });
      await redis.set(`spin_prize:${addr}`,           prize,          { ex: ttlSec });

      // Award coins prize immediately
      if (prize.type === 'coins') {
        const cur    = (await redis.get<number>(`coin_balance:${addr}`)) ?? 0;
        const newBal = cur + (prize.value as number);
        await redis.set(`coin_balance:${addr}`, newBal);
        const lbScore = (await redis.zscore('coin_lb', addr)) ?? 0;
        await redis.zadd('coin_lb', { score: Math.max(newBal, Number(lbScore)), member: addr });
      }
    } else {
      memSpinDate.set(addr, today);
      memSpinCount.set(addr, newSpinsToday);
      memPrize.set(addr, prize);
    }

    return NextResponse.json({
      ok:         true,
      prize,
      spinsToday: newSpinsToday,
      nextCost:   spinCost(newSpinsToday),
      nextAt:     nextUTCMidnight(),
    });
  } catch (e) {
    console.error('spin POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
