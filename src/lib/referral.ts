// ── Referral program core ───────────────────────────────────────────────────
// $0.25 (USDC, paid manually in weekly batches) to the referrer for every
// referee that performs REFERRAL_TX_THRESHOLD onchain transactions through
// the game. Design: docs/superpowers/specs/2026-07-19-referral-program-design.md
//
// Every counted transaction is verified from its onchain receipt by LOGS
// (Base App smart wallets go through bundler/EntryPoint, so receipt from/to
// are useless — the player only appears in indexed event topics).

import { createPublicClient, http, isAddress, keccak256, toBytes, pad } from 'viem';
import { base } from 'viem/chains';
import { CHECKIN_ADDRESS } from '@/config/checkin-contract';
import { SCORECLAIM_ADDRESS } from '@/config/scoreclaim-contract';
import { SPIN_ADDRESS } from '@/config/spin-contract';
import { NFT_CONTRACT, NFT_DEPLOYED } from '@/config/nft-contract';
import { sendBaseNotification } from './baseNotifications';

// ── Tunables ────────────────────────────────────────────────────────────────
export const REFERRAL_TX_THRESHOLD = 10;
export const REFERRAL_REWARD_CENTS = 25;
export const REFERRAL_PAYOUT_MIN_CENTS = 100;
export const REFERRAL_PER_REFERRER_CAP = 20; // paid referrals per referrer
export const REFERRAL_BUDGET_CAP_CENTS = 10000; // $100 pilot pool
export const REFERRAL_REFEREE_BONUS_COINS = 100;
export const REFERRAL_REFEREE_BONUS_BOOSTER = 'boost_magnet';

export function referralEnabled(): boolean {
  return process.env.REFERRAL_ENABLED === '1';
}

// ── Redis ───────────────────────────────────────────────────────────────────

interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: unknown): Promise<unknown>;
  incr(key: string): Promise<number>;
  incrby(key: string, n: number): Promise<number>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  zscore(key: string, member: string): Promise<number | null>;
  exists(key: string): Promise<number>;
  mget<T>(...keys: string[]): Promise<T>;
  lpush(key: string, value: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

let redisClient: RedisLike | null = null;

export async function getReferralRedis(): Promise<RedisLike | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (redisClient) return redisClient;
  const { Redis } = await import('@upstash/redis');
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }) as unknown as RedisLike;
  return redisClient;
}

// ── Codes ───────────────────────────────────────────────────────────────────
// Deterministic, non-reversible 8-char code per address. Stored code->address
// on first use so lookup is O(1).

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function codeForAddress(address: string): string {
  const salt = process.env.REFERRAL_CODE_SALT || 'base-runner-referral';
  const digest = keccak256(toBytes(`${salt}:${address.toLowerCase()}`));
  let out = '';
  for (let i = 0; i < 8; i++) {
    const byte = parseInt(digest.slice(2 + i * 2, 4 + i * 2), 16);
    out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return out;
}

/** Register the caller's code mapping (idempotent) and return the code. */
export async function ensureCode(redis: RedisLike, address: string): Promise<string> {
  const code = codeForAddress(address);
  await redis.set(`referral_code:${code}`, address.toLowerCase(), { nx: true });
  return code;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type ReferralStatus = 'pending' | 'qualified' | 'qualified_unpaid';

export interface ReferralBind {
  referrer: string;
  boundAt: number;
  status: ReferralStatus;
}

// ── Onchain verification ────────────────────────────────────────────────────

const rpcClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

export function gameContracts(): string[] {
  const list: string[] = [CHECKIN_ADDRESS, SCORECLAIM_ADDRESS, SPIN_ADDRESS];
  if (NFT_DEPLOYED) list.push(NFT_CONTRACT);
  return list.map((a) => a.toLowerCase());
}

/**
 * A tx counts iff the receipt succeeded and contains at least one log emitted
 * by a whitelisted game contract with the player's address in an indexed
 * topic (4337-safe).
 */
export async function verifyGameTx(txHash: `0x${string}`, address: string): Promise<boolean> {
  if (!isAddress(address)) return false;
  let receipt;
  try {
    receipt = await rpcClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return false; // unknown hash / not mined yet — client can retry later runs
  }
  if (receipt.status !== 'success') return false;

  const contracts = new Set(gameContracts());
  const paddedPlayer = pad(address.toLowerCase() as `0x${string}`, { size: 32 }).toLowerCase();
  return receipt.logs.some(
    (log) =>
      contracts.has(log.address.toLowerCase()) &&
      log.topics.some((t) => (t ?? '').toLowerCase() === paddedPlayer),
  );
}

// ── Qualification ───────────────────────────────────────────────────────────

/**
 * Transition a referee from pending to qualified once the tx threshold is
 * reached. Applies referrer cap and the global budget pool; credits the
 * referrer balance and notifies them. Safe to call repeatedly (guarded by a
 * SET NX transition lock). Returns true when a transition happened.
 */
export async function qualifyIfReady(redis: RedisLike, referee: string): Promise<boolean> {
  const addr = referee.toLowerCase();
  const bind = await redis.get<ReferralBind>(`referral_bound:${addr}`);
  if (!bind || bind.status !== 'pending') return false;

  const txCount = Number((await redis.get<number>(`referral_tx:${addr}`)) || 0);
  if (txCount < REFERRAL_TX_THRESHOLD) return false;

  // One-shot transition guard (bind JSON rewrite below is not atomic).
  const first = await redis.set(`referral_qlock:${addr}`, '1', { nx: true, ex: 3600 });
  if (first !== 'OK') return false;

  const referrer = bind.referrer.toLowerCase();
  const paidSoFar = Number((await redis.get<number>(`referral_paid_count:${referrer}`)) || 0);
  const budgetUsed = Number((await redis.get<number>('referral_budget_used')) || 0);

  const payable =
    paidSoFar < REFERRAL_PER_REFERRER_CAP &&
    budgetUsed + REFERRAL_REWARD_CENTS <= REFERRAL_BUDGET_CAP_CENTS;

  const status: ReferralStatus = payable ? 'qualified' : 'qualified_unpaid';
  await redis.set(`referral_bound:${addr}`, { ...bind, status });
  await redis.srem('referral_pending', addr);

  if (payable) {
    await Promise.all([
      redis.incrby(`referral_balance:${referrer}`, REFERRAL_REWARD_CENTS),
      redis.incr(`referral_paid_count:${referrer}`),
      redis.incrby('referral_budget_used', REFERRAL_REWARD_CENTS),
    ]);
    if (process.env.BASE_NOTIFICATIONS_API_KEY && process.env.NEXT_PUBLIC_APP_URL) {
      sendBaseNotification({
        walletAddresses: [referrer],
        title: 'You earned $0.25',
        message:
          'Your invited friend just hit 10 transactions in Base Runner. Reward added to your referral balance.',
      }).catch((err) => console.warn('referral qualify notification failed:', err));
    }
  }
  return true;
}
