import { after } from 'next/server';
import type { RewardBundle } from './config.ts';
import type { AppliedRewardSummary } from './rewards.ts';

export type EconomyTelemetryEventName =
  | 'economy_focus_set'
  | 'economy_fragment_earned'
  | 'economy_fragment_overflowed'
  | 'economy_reward_claimed'
  | 'economy_coin_earned'
  | 'economy_coin_spent'
  | 'economy_booster_acquired'
  | 'economy_booster_used'
  | 'economy_craft_available'
  | 'economy_craft_completed'
  | 'economy_shop_item_purchased'
  | 'economy_booster_pack_purchased'
  | 'economy_focus_switched'
  | 'economy_spin_result'
  | 'economy_checkin_claimed'
  | 'economy_quest_claimed'
  | 'economy_level_reward_claimed'
  | 'game_run_completed'
  // Reserved for a future client-side emitter; no server emitter today.
  | 'game_difficulty_band_reached'
  | 'economy_daily_quality_bonus_claimed'
  | 'quest_elite_run_progressed';

export interface EconomyTelemetryEvent {
  event: EconomyTelemetryEventName;
  address: string;
  ts: number;
  payload: Record<string, unknown>;
}

interface RedisLike {
  zadd(key: string, value: { score: number; member: string }): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

const memEvents = new Map<string, EconomyTelemetryEvent[]>();

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }) as RedisLike;
}

export function trackEconomyEventAfter(
  event: EconomyTelemetryEventName,
  address: string,
  payload: Record<string, unknown> = {},
) {
  after(() => {
    trackEconomyEvent(event, address, payload).catch((err) => {
      console.warn('economy telemetry failed:', err);
    });
  });
}

export function trackRewardBundleTelemetryAfter(
  address: string,
  source: string,
  reward: RewardBundle | null,
  result: Partial<AppliedRewardSummary> = {},
  extra: Record<string, unknown> = {},
) {
  trackEconomyEventAfter('economy_reward_claimed', address, { source, reward, result, ...extra });

  const coinsDelta = Math.max(0, Math.floor(Number(result.coinsDelta) || 0));
  if (coinsDelta > 0) {
    trackEconomyEventAfter('economy_coin_earned', address, { source, amount: coinsDelta, ...extra });
  }

  const fragmentsAwarded = Math.max(0, Math.floor(Number(result.fragmentsAwarded) || 0));
  if (fragmentsAwarded > 0) {
    trackEconomyEventAfter('economy_fragment_earned', address, { source, amount: fragmentsAwarded, ...extra });
  }

  const fragmentsOverflowed = Math.max(0, Math.floor(Number(result.fragmentsOverflowed) || 0));
  if (fragmentsOverflowed > 0) {
    trackEconomyEventAfter('economy_fragment_overflowed', address, {
      source,
      amount: fragmentsOverflowed,
      fallbackCoins: Math.max(0, Math.floor(Number(result.fallbackCoins) || 0)),
      ...extra,
    });
  }

  const boostersDelta = Math.max(0, Math.floor(Number(result.boostersDelta) || 0));
  if (boostersDelta > 0) {
    trackEconomyEventAfter('economy_booster_acquired', address, { source, amount: boostersDelta, ...extra });
  }
}

export async function trackEconomyEvent(
  event: EconomyTelemetryEventName,
  address: string,
  payload: Record<string, unknown> = {},
) {
  const ts = Date.now();
  const date = new Date(ts).toISOString().slice(0, 10);
  const key = `economy_events:${date}`;
  const entry: EconomyTelemetryEvent = {
    event,
    address: address.toLowerCase(),
    ts,
    payload: sanitizePayload(payload),
  };

  const redis = await getRedis();
  if (redis) {
    await redis.zadd(key, { score: ts, member: JSON.stringify(entry) });
    await redis.expire(key, 60 * 86400);
    return;
  }

  const events = memEvents.get(key) ?? [];
  events.push(entry);
  if (events.length > 1000) events.splice(0, events.length - 1000);
  memEvents.set(key, events);
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || typeof value === 'function') continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20);
    } else if (typeof value === 'object') {
      out[key] = JSON.parse(JSON.stringify(value));
    }
  }
  return out;
}
