// ── Onchain achievement badges ──────────────────────────────────────────────
// 10 career categories x 8 tiers, mintable as ERC-1155 badges through the
// existing BaseRunnerItems contract (free, paymaster gas). The contract's
// claimed(address, tokenId) mapping is the source of truth for "minted";
// eligibility comes from server-authoritative state only.
// Design: docs/superpowers/specs/2026-07-20-badges-localization-squads-design.md

import { createPublicClient, http, isAddress } from 'viem';
import { base } from 'viem/chains';
import { NFT_ABI, NFT_CONTRACT, NFT_DEPLOYED } from '@/config/nft-contract';
import {
  readCheckinRewardState,
  readLevelState,
  readQuestState,
  readShop,
} from './economy/storage.ts';

export interface BadgeCategory {
  id: string;          // itemId prefix: badge_{id}_{tier}
  name: string;
  baseTokenId: number; // tier 1 tokenId; tier N = base + N - 1
  targets: readonly number[]; // 8 tier targets
}

export const BADGE_CATEGORIES: readonly BadgeCategory[] = [
  { id: 'rows', name: 'Marathon Runner', baseTokenId: 30, targets: [100, 300, 700, 1400, 2400, 4000, 7000, 12000] },
  { id: 'coins', name: 'Coin Collector', baseTokenId: 38, targets: [40, 120, 300, 600, 1000, 1800, 3000, 5000] },
  { id: 'games', name: 'Dedicated Player', baseTokenId: 46, targets: [5, 15, 35, 70, 120, 200, 350, 600] },
  { id: 'record', name: 'High Scorer', baseTokenId: 54, targets: [20, 40, 80, 150, 250, 400, 600, 900] },
  { id: 'elite', name: 'Elite Runner', baseTokenId: 62, targets: [1, 3, 7, 15, 30, 50, 80, 120] },
  { id: 'checkins', name: 'Daily Devotee', baseTokenId: 70, targets: [3, 7, 15, 30, 60, 100, 180, 300] },
  { id: 'streak', name: 'Streak Keeper', baseTokenId: 78, targets: [3, 7, 14, 21, 30, 45, 60, 100] },
  { id: 'level', name: 'Rising Legend', baseTokenId: 86, targets: [5, 10, 15, 20, 25, 30, 40, 50] },
  { id: 'collection', name: 'Collector', baseTokenId: 94, targets: [2, 4, 6, 8, 10, 12, 14, 16] },
  { id: 'txs', name: 'Onchain Runner', baseTokenId: 102, targets: [5, 15, 30, 60, 100, 200, 350, 600] },
] as const;

export const BADGE_TIERS = 8;

export function isBadgeItem(itemId: string): boolean {
  return itemId.startsWith('badge_');
}

/** badge_{category}_{tier} -> {category, tier, tokenId}; undefined if invalid. */
export function parseBadgeItem(itemId: string):
  | { category: BadgeCategory; tier: number; tokenId: number }
  | undefined {
  const m = /^badge_([a-z]+)_([1-8])$/.exec(itemId);
  if (!m) return undefined;
  const category = BADGE_CATEGORIES.find((c) => c.id === m[1]);
  if (!category) return undefined;
  const tier = Number(m[2]);
  return { category, tier, tokenId: category.baseTokenId + tier - 1 };
}

export function badgeTokenId(itemId: string): number | undefined {
  return parseBadgeItem(itemId)?.tokenId;
}

interface RedisLike {
  get<T>(key: string): Promise<T | null>;
}

/** Server-authoritative progress value per category. */
export async function getBadgeProgress(
  redis: RedisLike | null,
  address: string,
): Promise<Record<string, number>> {
  const addr = address.toLowerCase();
  const [quests, checkin, levels, shop, txCount] = await Promise.all([
    readQuestState(addr),
    readCheckinRewardState(addr),
    readLevelState(addr),
    readShop(addr),
    redis ? redis.get<number>(`game_tx:${addr}`) : Promise.resolve(null),
  ]);
  const checkinAny = checkin as typeof checkin & { bestStreak?: number };
  return {
    rows: quests.rows.progress,
    coins: quests.coins.progress,
    games: quests.games.progress,
    record: quests.record.progress,
    elite: quests.elite_runs.progress,
    checkins: checkin.total,
    streak: Math.max(checkin.streak, Math.floor(Number(checkinAny.bestStreak) || 0)),
    level: Math.max(1, levels.level),
    collection: (shop.owned?.length || 0) + (shop.trailPacks?.length || 0),
    txs: Math.max(0, Math.floor(Number(txCount) || 0)),
  };
}

const rpcClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

/** claimed(user, tokenId) for all 80 badges in one multicall, keyed by tokenId. */
export async function getClaimedByTokenId(address: string): Promise<Record<number, boolean>> {
  const out: Record<number, boolean> = {};
  const allTokenIds = BADGE_CATEGORIES.flatMap((c) =>
    Array.from({ length: BADGE_TIERS }, (_, i) => c.baseTokenId + i),
  );
  if (!NFT_DEPLOYED || !isAddress(address)) {
    for (const id of allTokenIds) out[id] = false;
    return out;
  }
  try {
    const results = await rpcClient.multicall({
      contracts: allTokenIds.map((tokenId) => ({
        address: NFT_CONTRACT,
        abi: NFT_ABI,
        functionName: 'claimed' as const,
        args: [address as `0x${string}`, BigInt(tokenId)],
      })),
      allowFailure: true,
    });
    allTokenIds.forEach((tokenId, i) => {
      out[tokenId] = results[i].status === 'success' && results[i].result === true;
    });
  } catch {
    for (const id of allTokenIds) out[id] = false;
  }
  return out;
}
