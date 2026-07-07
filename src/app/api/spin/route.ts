import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { spinCost } from '@/config/spin-contract';
import {
  CRAFT_CONFIG,
  FRAGMENT_FALLBACK_COINS,
  REWARD_CONTAINERS,
  type CraftableType,
  type EconomyTier,
  type RewardBundle,
} from '@/lib/economy/config.ts';
import { awardFragments, getCraftMeta, grantItem, ownsItem, type EconomyShopData } from '@/lib/economy/core.ts';
import { addXpToLevelState, type LevelReward, type LevelState } from '@/lib/economy/levels.ts';
import { readCoins, readLevelState, readShop, writeCoins, writeLevelState, writeShop } from '@/lib/economy/storage.ts';
import { trackEconomyEventAfter, trackRewardBundleTelemetryAfter } from '@/lib/economy/telemetry.ts';

type Rarity = EconomyTier | 'uncommon';
type BoosterId = 'boost_magnet' | 'boost_double' | 'boost_shield';
type SpinPrizeKind =
  | 'coins'
  | 'booster'
  | 'fragments'
  | 'fragment_burst'
  | 'xp'
  | 'crate'
  | 'direct_cosmetic'
  | 'skin'
  | 'trail'
  | 'nothing';

type SpinPrize = {
  type: SpinPrizeKind;
  value: string | number;
  weight: number;
  label: string;
  rarity: Rarity;
  amount?: number;
};

type AwardedPrize = Omit<SpinPrize, 'weight'> & {
  serverApplied: true;
  fragmentsAwarded?: number;
  fragmentsOverflowed?: number;
  fallbackCoins?: number;
  itemType?: CraftableType;
  serverLevels?: LevelState;
  levelUps?: Array<{ level: number; reward: LevelReward | null }>;
};

type SpinResponse = {
  ok: true;
  prize: AwardedPrize;
  shop: EconomyShopData;
  coins: number;
  spinsToday: number;
  nextCost: number;
  nextAt: number;
  spinId: string;
  idempotent?: boolean;
};

const BOOSTERS: readonly BoosterId[] = ['boost_magnet', 'boost_double', 'boost_shield'];

// Server-picked canonical V1 pool. We keep entries granular so the wheel can
// show useful result labels while preserving the designed top-level weights.
const SPIN_PRIZES = [
  { type: 'coins', value: 15, weight: 8, label: '15 Coins', rarity: 'common' },
  { type: 'coins', value: 35, weight: 9, label: '35 Coins', rarity: 'common' },
  { type: 'coins', value: 75, weight: 8, label: '75 Coins', rarity: 'uncommon' },

  { type: 'booster', value: 'boost_magnet', weight: 9, label: 'Coin Magnet', rarity: 'uncommon' },
  { type: 'booster', value: 'boost_double', weight: 8, label: 'Double Coins', rarity: 'uncommon' },
  { type: 'booster', value: 'boost_shield', weight: 8, label: 'Second Chance', rarity: 'uncommon' },

  { type: 'fragments', value: 1, weight: 8, label: '+1 Focus Fragment', rarity: 'common' },
  { type: 'fragments', value: 2, weight: 8, label: '+2 Focus Fragments', rarity: 'common' },
  { type: 'fragments', value: 3, weight: 8, label: '+3 Focus Fragments', rarity: 'uncommon' },

  { type: 'xp', value: 50, weight: 3, label: '+50 XP', rarity: 'common' },
  { type: 'xp', value: 100, weight: 4, label: '+100 XP', rarity: 'uncommon' },
  { type: 'xp', value: 150, weight: 3, label: '+150 XP', rarity: 'rare' },

  { type: 'fragment_burst', value: 4, weight: 2, label: '+4 Focus Fragments', rarity: 'rare' },
  { type: 'fragment_burst', value: 5, weight: 3, label: '+5 Focus Fragments', rarity: 'rare' },
  { type: 'fragment_burst', value: 6, weight: 3, label: '+6 Focus Fragments', rarity: 'epic' },

  { type: 'crate', value: 'rare_crate', weight: 3, label: 'Rare Crate', rarity: 'rare' },
  { type: 'crate', value: 'focus_chest', weight: 2, label: 'Focus Chest', rarity: 'rare' },

  { type: 'direct_cosmetic', value: 'common_rare', weight: 2, label: 'Gear Unlock', rarity: 'rare' },
  { type: 'nothing', value: 0, weight: 1, label: 'Almost', rarity: 'common' },
] as const satisfies readonly SpinPrize[];

function todayUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function nextUTCMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function pickPrize(): SpinPrize {
  const total = SPIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of SPIN_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return SPIN_PRIZES[0];
}

// In-memory fallback for local dev (no Redis)
const memSpinCount = new Map<string, number>();
const memSpinDate = new Map<string, string>();
const memPrize = new Map<string, AwardedPrize>();
const memSpinClaims = new Map<string, SpinResponse>();
const memSpinLocks = new Set<string>();

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function sanitizeSpinId(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[a-zA-Z0-9_-]{8,96}$/.test(trimmed)) return trimmed;
  }
  return `server_${randomUUID()}`;
}

async function readSpinClaim(redis: Awaited<ReturnType<typeof getRedis>>, claimKey: string): Promise<SpinResponse | null> {
  if (redis) return (await redis.get<SpinResponse>(claimKey)) ?? null;
  return memSpinClaims.get(claimKey) ?? null;
}

async function writeSpinClaim(
  redis: Awaited<ReturnType<typeof getRedis>>,
  claimKey: string,
  response: SpinResponse,
  ttlSec: number,
) {
  if (redis) await redis.set(claimKey, response, { ex: ttlSec });
  else memSpinClaims.set(claimKey, response);
}

async function tryAcquireSpinLock(
  redis: Awaited<ReturnType<typeof getRedis>>,
  lockKey: string,
  ttlSec: number,
): Promise<boolean> {
  if (redis) {
    const result = await redis.set(lockKey, '1', { ex: Math.min(ttlSec, 30), nx: true });
    return result === 'OK';
  }
  if (memSpinLocks.has(lockKey)) return false;
  memSpinLocks.add(lockKey);
  return true;
}

async function releaseSpinLock(redis: Awaited<ReturnType<typeof getRedis>>, lockKey: string) {
  if (redis) await redis.del(lockKey);
  else memSpinLocks.delete(lockKey);
}

function addBooster(shop: EconomyShopData, boosterId: string, amount: number): EconomyShopData {
  const id = BOOSTERS.includes(boosterId as BoosterId)
    ? boosterId
    : BOOSTERS[Math.floor(Math.random() * BOOSTERS.length)];
  return {
    ...shop,
    boosterCharges: {
      ...shop.boosterCharges,
      [id]: (shop.boosterCharges[id] || 0) + Math.max(1, Math.floor(amount || 1)),
    },
  };
}

function addRandomBoosters(shop: EconomyShopData, amount: number): EconomyShopData {
  let next = shop;
  const count = Math.max(0, Math.floor(amount || 0));
  for (let i = 0; i < count; i++) {
    const boosterId = BOOSTERS[Math.floor(Math.random() * BOOSTERS.length)];
    next = addBooster(next, boosterId, 1);
  }
  return next;
}

function focusCanReceiveFragments(shop: EconomyShopData, amount: number) {
  const focusId = shop.focusItemId;
  const meta = getCraftMeta(focusId);
  if (!focusId || !meta || ownsItem(shop, focusId, meta.type)) return null;
  const current = shop.fragments[focusId] || 0;
  const missing = Math.max(0, meta.fragments - current);
  if (missing <= 0) return null;
  return { focusId, amount: Math.min(missing, amount) };
}

function applyFocusFragments(
  shop: EconomyShopData,
  amount: number,
  fallbackCoinsPerFragment: number,
) {
  const wholeAmount = Math.max(0, Math.floor(amount || 0));
  if (wholeAmount <= 0) return { shop, coinsDelta: 0, fragmentsAwarded: 0, fragmentsOverflowed: 0, fallbackCoins: 0 };

  const target = focusCanReceiveFragments(shop, wholeAmount);
  if (!target) {
    const fallbackCoins = wholeAmount * fallbackCoinsPerFragment;
    return { shop, coinsDelta: fallbackCoins, fragmentsAwarded: 0, fragmentsOverflowed: wholeAmount, fallbackCoins };
  }

  const result = awardFragments(shop, target.focusId, target.amount);
  if (!result.ok) {
    const fallbackCoins = wholeAmount * fallbackCoinsPerFragment;
    return { shop, coinsDelta: fallbackCoins, fragmentsAwarded: 0, fragmentsOverflowed: wholeAmount, fallbackCoins };
  }

  const fragmentsAwarded = result.fragmentsDelta || 0;
  const leftover = Math.max(0, wholeAmount - fragmentsAwarded);
  const fallbackCoins = leftover * fallbackCoinsPerFragment;
  return {
    shop: result.state,
    coinsDelta: fallbackCoins,
    fragmentsAwarded,
    fragmentsOverflowed: leftover,
    fallbackCoins,
  };
}

function applyContainer(
  shop: EconomyShopData,
  containerId: string,
  fallbackCoinsPerFragment: number,
) {
  const bundle = REWARD_CONTAINERS[containerId as keyof typeof REWARD_CONTAINERS];
  if (!bundle) return { shop, coinsDelta: 0, fragmentsAwarded: 0, fragmentsOverflowed: 0, fallbackCoins: 0 };

  let nextShop = shop;
  let coinsDelta = 'coins' in bundle ? bundle.coins : 0;
  let fragmentsAwarded = 0;
  let fragmentsOverflowed = 0;
  let fallbackCoins = 0;

  const fragments = 'fragments' in bundle ? bundle.fragments : 0;
  if (fragments) {
    const result = applyFocusFragments(nextShop, fragments, fallbackCoinsPerFragment);
    nextShop = result.shop;
    coinsDelta += result.coinsDelta;
    fragmentsAwarded += result.fragmentsAwarded;
    fragmentsOverflowed += result.fragmentsOverflowed;
    fallbackCoins += result.fallbackCoins;
  }

  const boosters = 'boosters' in bundle ? bundle.boosters : 0;
  if (boosters) nextShop = addRandomBoosters(nextShop, boosters);

  return { shop: nextShop, coinsDelta, fragmentsAwarded, fragmentsOverflowed, fallbackCoins };
}

function pickDirectCosmetic(shop: EconomyShopData): AwardedPrize | null {
  const eligible = Object.entries(CRAFT_CONFIG).filter(([itemId, config]) => {
    if (config.type !== 'skin' && config.type !== 'trail') return false;
    if (config.tier !== 'common' && config.tier !== 'rare') return false;
    return !ownsItem(shop, itemId, config.type);
  });

  if (eligible.length === 0) return null;

  const [itemId, config] = eligible[Math.floor(Math.random() * eligible.length)];
  const itemType: 'skin' | 'trail' = config.type === 'trail' ? 'trail' : 'skin';
  return {
    type: itemType,
    value: itemId,
    label: `${config.name} ${itemType === 'skin' ? 'Skin' : 'Trail'}`,
    rarity: config.tier,
    serverApplied: true,
    itemType,
  };
}

function spinPrizeToRewardBundle(prize: AwardedPrize): RewardBundle | null {
  if (prize.type === 'coins') return { coins: Number(prize.value) || 0 };
  if (prize.type === 'booster') return { boosters: prize.amount || 1 };
  if (prize.type === 'fragments' || prize.type === 'fragment_burst') return { fragments: Number(prize.value) || 0 };
  if (prize.type === 'crate') return { container: String(prize.value) as keyof typeof REWARD_CONTAINERS };
  if (prize.type === 'xp') return { xp: Number(prize.value) || 0 };
  return null;
}

async function applySpinPrize(
  address: string,
  prize: SpinPrize,
  startingShop: EconomyShopData,
  startingCoins: number,
  cost: number,
) {
  let shop = startingShop;
  let coins = startingCoins - cost;
  let awarded: AwardedPrize = { ...prize, serverApplied: true };
  let nextLevels: LevelState | null = null;

  if (prize.type === 'coins') {
    coins += Number(prize.value) || 0;
  } else if (prize.type === 'xp') {
    const levelState = await readLevelState(address);
    const applied = addXpToLevelState(levelState, Number(prize.value) || 0);
    nextLevels = applied.state;
    awarded = { ...awarded, serverLevels: applied.state, levelUps: applied.levelUps };
  } else if (prize.type === 'booster') {
    shop = addBooster(shop, String(prize.value), prize.amount || 1);
  } else if (prize.type === 'fragments' || prize.type === 'fragment_burst') {
    const result = applyFocusFragments(shop, Number(prize.value) || 0, FRAGMENT_FALLBACK_COINS);
    shop = result.shop;
    coins += result.coinsDelta;
    awarded = {
      ...awarded,
      fragmentsAwarded: result.fragmentsAwarded,
      fragmentsOverflowed: result.fragmentsOverflowed,
      fallbackCoins: result.fallbackCoins,
    };
  } else if (prize.type === 'crate') {
    const result = applyContainer(shop, String(prize.value), FRAGMENT_FALLBACK_COINS);
    shop = result.shop;
    coins += result.coinsDelta;
    awarded = {
      ...awarded,
      fragmentsAwarded: result.fragmentsAwarded,
      fragmentsOverflowed: result.fragmentsOverflowed,
      fallbackCoins: result.fallbackCoins,
    };
  } else if (prize.type === 'direct_cosmetic') {
    const cosmetic = pickDirectCosmetic(shop);
    if (cosmetic) {
      const meta = getCraftMeta(String(cosmetic.value));
      if (meta) shop = grantItem(shop, String(cosmetic.value), meta.type);
      awarded = cosmetic;
    } else {
      coins += 100;
      awarded = {
        type: 'coins',
        value: 100,
        label: '100 Coins',
        rarity: 'rare',
        serverApplied: true,
        fallbackCoins: 100,
      };
    }
  }

  coins = Math.max(0, Math.floor(coins));
  await Promise.all([
    writeShop(address, shop),
    writeCoins(address, coins),
    ...(nextLevels ? [writeLevelState(address, nextLevels)] : []),
  ]);

  return { shop, coins, prize: awarded };
}

// ── GET /api/spin?address=0x... — spin count + next cost ─────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
  const nextAt = nextUTCMidnight();

  if (!address) return NextResponse.json({ spinsToday: 0, nextCost: 0, nextAt });

  const today = todayUTC();
  const redis = await getRedis();

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
    const { address, spinId: rawSpinId } = await req.json();
    if (!address) return NextResponse.json({ ok: false, error: 'no address' }, { status: 400 });

    const addr = (address as string).toLowerCase();
    const today = todayUTC();
    const redis = await getRedis();
    const ttlSec = Math.ceil((nextUTCMidnight() - Date.now()) / 1000) + 120;
    const spinId = sanitizeSpinId(rawSpinId);
    const claimKey = `spin_claim:${addr}:${today}:${spinId}`;
    const lockKey = `spin_lock:${addr}:${today}`;

    const existingClaim = await readSpinClaim(redis, claimKey);
    if (existingClaim) return NextResponse.json({ ...existingClaim, idempotent: true });

    const locked = await tryAcquireSpinLock(redis, lockKey, ttlSec);
    if (!locked) {
      return NextResponse.json({ ok: false, error: 'spin_pending', spinId }, { status: 409 });
    }

    try {
      const claimAfterLock = await readSpinClaim(redis, claimKey);
      if (claimAfterLock) return NextResponse.json({ ...claimAfterLock, idempotent: true });

      let spinsToday = 0;
      if (redis) {
        spinsToday = (await redis.get<number>(`spin_count:${addr}:${today}`)) ?? 0;
      } else {
        spinsToday = memSpinDate.get(addr) === today ? (memSpinCount.get(addr) ?? 0) : 0;
      }

      const cost = spinCost(spinsToday);
      const [shop, coins] = await Promise.all([
        readShop(addr),
        readCoins(addr),
      ]);

      if (cost > 0 && coins < cost) {
        return NextResponse.json(
          { ok: false, error: 'insufficient_coins', cost, balance: coins, spinId },
          { status: 402 },
        );
      }

      const rawPrize = pickPrize();
      const applied = await applySpinPrize(addr, rawPrize, shop, coins, cost);
      const newSpinsToday = spinsToday + 1;

      if (redis) {
        await redis.set(`spin_count:${addr}:${today}`, newSpinsToday, { ex: ttlSec });
        await redis.set(`spin_prize:${addr}`, applied.prize, { ex: ttlSec });
      } else {
        memSpinDate.set(addr, today);
        memSpinCount.set(addr, newSpinsToday);
        memPrize.set(addr, applied.prize);
      }

      const response: SpinResponse = {
        ok: true,
        prize: applied.prize,
        shop: applied.shop,
        coins: applied.coins,
        spinsToday: newSpinsToday,
        nextCost: spinCost(newSpinsToday),
        nextAt: nextUTCMidnight(),
        spinId,
      };
      await writeSpinClaim(redis, claimKey, response, ttlSec);

      trackEconomyEventAfter('economy_spin_result', addr, {
        spinId,
        cost,
        prizeType: applied.prize.type,
        value: applied.prize.value,
        rarity: applied.prize.rarity,
      });
      if (cost > 0) {
        trackEconomyEventAfter('economy_coin_spent', addr, {
          sink: 'spin',
          amount: cost,
          balanceAfter: applied.coins,
          spinId,
        });
      }
      trackRewardBundleTelemetryAfter(
        addr,
        'spin',
        spinPrizeToRewardBundle(applied.prize),
        {
          coinsDelta: applied.prize.type === 'coins' ? Number(applied.prize.value) || 0 : 0,
          fragmentsAwarded: applied.prize.fragmentsAwarded || 0,
          fragmentsOverflowed: applied.prize.fragmentsOverflowed || 0,
          fallbackCoins: applied.prize.fallbackCoins || 0,
          boostersDelta: applied.prize.type === 'booster' ? applied.prize.amount || 1 : 0,
          xpDelta: applied.prize.type === 'xp' ? Number(applied.prize.value) || 0 : 0,
        },
        { spinId, cost, prizeType: applied.prize.type, rarity: applied.prize.rarity },
      );

      return NextResponse.json(response);
    } finally {
      await releaseSpinLock(redis, lockKey);
    }
  } catch (e) {
    console.error('spin POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
