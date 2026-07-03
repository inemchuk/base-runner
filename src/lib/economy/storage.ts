import { normalizeShopData, type EconomyShopData } from './core.ts';
import { normalizeLevelState, type LevelState } from './levels.ts';
import { normalizeQuestState, type QuestState } from './quests.ts';

const memShop = new Map<string, EconomyShopData>();
const memCoins = new Map<string, number>();
const memCoinBest = new Map<string, number>();
const memScoreBest = new Map<string, number>();
const memCheckinReward = new Map<string, EconomyCheckinRewardState>();
const memDailyFragmentChest = new Map<string, EconomyDailyFragmentChestState>();
const memQuest = new Map<string, QuestState>();
const memLevel = new Map<string, LevelState>();

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
  zscore(key: string, member: string): Promise<number | null>;
  zadd(key: string, value: { score: number; member: string }): Promise<unknown>;
}

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }) as RedisLike;
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

export async function writeBestScore(address: string, score: number): Promise<void> {
  const addr = normalizeAddress(address);
  const normalized = Math.max(0, Math.floor(Number(score) || 0));
  if (normalized <= 0) return;

  const redis = await getRedis();
  if (redis) {
    const currentBest = await redis.zscore('scores', addr);
    const best = Math.max(normalized, Number(currentBest) || 0);
    await redis.zadd('scores', { score: best, member: addr });
    return;
  }

  const currentBest = memScoreBest.get(addr) ?? 0;
  memScoreBest.set(addr, Math.max(normalized, currentBest));
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
