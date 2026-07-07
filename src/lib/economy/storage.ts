import { normalizeShopData, type EconomyShopData } from './core.ts';
import { normalizeLevelState, type LevelState } from './levels.ts';
import { normalizeQuestState, type QuestState } from './quests.ts';
import { normalizeDailyQualityState, type DailyQualityState } from './daily-quality.ts';

const memShop = new Map<string, EconomyShopData>();
const memCoins = new Map<string, number>();
const memCoinBest = new Map<string, number>();
const memCheckinReward = new Map<string, EconomyCheckinRewardState>();
const memDailyFragmentChest = new Map<string, EconomyDailyFragmentChestState>();
const memQuest = new Map<string, QuestState>();
const memLevel = new Map<string, LevelState>();
const memDailyQuality = new Map<string, DailyQualityState>();

export interface EconomyCheckinRewardState {
  lastDate: string | null;
  streak: number;
  total: number;
}

export interface EconomyDailyFragmentChestState {
  lastDate: string | null;
  buysToday: number;
  total: number;
}

interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: unknown): Promise<unknown>;
  del(key: string): Promise<unknown>;
  zscore(key: string, member: string): Promise<number | null>;
  zadd(key: string, value: { score: number; member: string }): Promise<unknown>;
}

let redisClient: RedisLike | null = null;

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

const memLocks = new Set<string>();

// Best-effort mutual exclusion for read-modify-write economy actions.
// Mirrors the SET NX pattern used by the spin route so concurrent requests
// (double-tap, two tabs) can't both act on the same stale balance snapshot.
export async function acquireEconomyLock(key: string, ttlSec = 10): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    const result = await redis.set(key, '1', { ex: Math.min(ttlSec, 30), nx: true });
    return result === 'OK';
  }
  if (memLocks.has(key)) return false;
  memLocks.add(key);
  return true;
}

export async function releaseEconomyLock(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis) await redis.del(key);
  else memLocks.delete(key);
}

const memHydrated = new Set<string>();

// One-time legacy migration guard. Once a wallet has hydrated its local save
// into server storage, later hydrate calls are ignored so a client can't keep
// ratcheting server state upward with fresh client-supplied numbers.
export async function hasHydrated(address: string): Promise<boolean> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  if (redis) return (await redis.get<number>(`economy_hydrated:${addr}`)) != null;
  return memHydrated.has(addr);
}

export async function markHydrated(address: string): Promise<void> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  if (redis) await redis.set(`economy_hydrated:${addr}`, 1);
  else memHydrated.add(addr);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export async function readShop(address: string): Promise<EconomyShopData> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<EconomyShopData>>(`shop:${addr}`)
    : memShop.get(addr) ?? null;
  return normalizeShopData(data ?? {});
}

export async function writeShop(address: string, data: EconomyShopData): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeShopData(data);
  const redis = await getRedis();
  if (redis) await redis.set(`shop:${addr}`, normalized);
  else memShop.set(addr, normalized);
}

export async function mergeClientShop(address: string, input: Partial<EconomyShopData>): Promise<EconomyShopData> {
  const existing = await readShop(address);
  const merged = normalizeShopData({
    ...existing,
    owned: input.owned ?? existing.owned,
    equipped: input.equipped ?? existing.equipped,
    boosterCharges: input.boosterCharges ?? existing.boosterCharges,
    trailPacks: input.trailPacks ?? existing.trailPacks,
    equippedTrail: input.equippedTrail ?? existing.equippedTrail,
    equippedDeath: input.equippedDeath ?? existing.equippedDeath,
    deathPacks: input.deathPacks ?? existing.deathPacks,
    focusItemId: existing.focusItemId,
    fragments: existing.fragments,
    topUpFragments: existing.topUpFragments,
  });
  await writeShop(address, merged);
  return merged;
}

export async function readCoins(address: string): Promise<number> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const value = redis
    ? await redis.get<number>(`coin_balance:${addr}`)
    : memCoins.get(addr) ?? null;
  return Math.max(0, Math.floor(Number(value) || 0));
}

export async function writeCoins(address: string, balance: number): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = Math.max(0, Math.floor(Number(balance) || 0));
  const redis = await getRedis();
  if (redis) {
    const currentBest = await redis.zscore('coin_lb', addr);
    const best = Math.max(normalized, Number(currentBest) || 0);
    await redis.zadd('coin_lb', { score: best, member: addr });
    await redis.set(`coin_balance:${addr}`, normalized);
    return;
  }

  const currentBest = memCoinBest.get(addr) ?? 0;
  memCoinBest.set(addr, Math.max(normalized, currentBest));
  memCoins.set(addr, normalized);
}

export async function readCheckinRewardState(address: string): Promise<EconomyCheckinRewardState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<EconomyCheckinRewardState>>(`economy_checkin:${addr}`)
    : memCheckinReward.get(addr) ?? null;
  return normalizeCheckinRewardState(data ?? {});
}

export async function writeCheckinRewardState(address: string, state: EconomyCheckinRewardState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeCheckinRewardState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`economy_checkin:${addr}`, normalized);
  else memCheckinReward.set(addr, normalized);
}

export async function readDailyFragmentChestState(address: string): Promise<EconomyDailyFragmentChestState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<EconomyDailyFragmentChestState>>(`economy_daily_fragment_chest:${addr}`)
    : memDailyFragmentChest.get(addr) ?? null;
  return normalizeDailyFragmentChestState(data ?? {});
}

export async function writeDailyFragmentChestState(address: string, state: EconomyDailyFragmentChestState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeDailyFragmentChestState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`economy_daily_fragment_chest:${addr}`, normalized);
  else memDailyFragmentChest.set(addr, normalized);
}

export async function readDailyQualityState(address: string): Promise<DailyQualityState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<DailyQualityState>>(`economy_daily_quality:${addr}`)
    : memDailyQuality.get(addr) ?? null;
  return normalizeDailyQualityState(data ?? {});
}

export async function writeDailyQualityState(address: string, state: DailyQualityState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeDailyQualityState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`economy_daily_quality:${addr}`, normalized);
  else memDailyQuality.set(addr, normalized);
}

function normalizeCheckinRewardState(input: Partial<EconomyCheckinRewardState>): EconomyCheckinRewardState {
  return {
    lastDate: typeof input.lastDate === 'string' ? input.lastDate : null,
    streak: Math.max(0, Math.floor(Number(input.streak) || 0)),
    total: Math.max(0, Math.floor(Number(input.total) || 0)),
  };
}

function normalizeDailyFragmentChestState(input: Partial<EconomyDailyFragmentChestState>): EconomyDailyFragmentChestState {
  return {
    lastDate: typeof input.lastDate === 'string' ? input.lastDate : null,
    buysToday: Math.max(0, Math.floor(Number(input.buysToday) || 0)),
    total: Math.max(0, Math.floor(Number(input.total) || 0)),
  };
}

export async function readQuestState(address: string): Promise<QuestState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<QuestState>>(`quests:${addr}`)
    : memQuest.get(addr) ?? null;
  return normalizeQuestState(data ?? {});
}

export async function writeQuestState(address: string, state: QuestState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeQuestState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`quests:${addr}`, normalized);
  else memQuest.set(addr, normalized);
}

export async function readLevelState(address: string): Promise<LevelState> {
  const addr = normalizeAddress(address);
  const redis = await getRedis();
  const data = redis
    ? await redis.get<Partial<LevelState>>(`levels:${addr}`)
    : memLevel.get(addr) ?? null;
  return normalizeLevelState(data ?? {});
}

export async function writeLevelState(address: string, state: LevelState): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = normalizeLevelState(state);
  const redis = await getRedis();
  if (redis) await redis.set(`levels:${addr}`, normalized);
  else memLevel.set(addr, normalized);
}
