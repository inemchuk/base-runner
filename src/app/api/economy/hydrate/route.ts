import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { CRAFT_CONFIG } from '@/lib/economy/config.ts';
import { type EconomyShopData, getCraftMeta, normalizeShopData } from '@/lib/economy/core.ts';
import { LEVEL_REWARDS, normalizeLevelState, type LevelState } from '@/lib/economy/levels.ts';
import { normalizeQuestState, QUEST_DEFS, type QuestState } from '@/lib/economy/quests.ts';
import { isAntiCheatEnabled, verifySessionToken } from '@/lib/economy/session-token.ts';
import {
  hasHydrated,
  markHydrated,
  readCoins,
  readLevelState,
  readQuestState,
  readShop,
  writeCoins,
  writeLevelState,
  writeQuestState,
  writeShop,
} from '@/lib/economy/storage.ts';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, legacy, token } = body;
    if (!address || !isAddress(address) || !legacy || typeof legacy !== 'object') {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    // Require a valid session token in prod (skipped in local dev). This gates
    // unauthenticated drive-by calls; it does not stop a player self-minting a
    // token for their own address — full server-authority is deferred.
    if (isAntiCheatEnabled()) {
      const verified = token ? verifySessionToken(token, addr) : null;
      if (!verified || !verified.ok) {
        return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 422 });
      }
    }

    const [shop, coins, quests, levels, alreadyHydrated] = await Promise.all([
      readShop(addr),
      readCoins(addr),
      readQuestState(addr),
      readLevelState(addr),
      hasHydrated(addr),
    ]);

    // Legacy localStorage may only be migrated once per wallet. Later calls are
    // inert so client-supplied numbers can't be replayed to ratchet state up.
    if (alreadyHydrated) {
      return NextResponse.json({ ok: true, alreadyHydrated: true, shop, coins, quests, levels });
    }

    const nextCoins = Math.max(coins, sanitizeNumber(legacy.coins));
    const nextShop = mergeLegacyShop(shop, legacy.shop);
    const nextQuests = mergeLegacyQuests(quests, legacy.quests);
    const nextLevels = mergeLegacyLevels(levels, legacy.levels);

    // Note: legacy.bestScore is deliberately NOT migrated to the leaderboard —
    // the ranked set must only reflect scores verified through /api/score/submit.
    await Promise.all([
      writeShop(addr, nextShop),
      writeCoins(addr, nextCoins),
      writeQuestState(addr, nextQuests),
      writeLevelState(addr, nextLevels),
    ]);
    await markHydrated(addr);

    return NextResponse.json({
      ok: true,
      shop: nextShop,
      coins: nextCoins,
      quests: nextQuests,
      levels: nextLevels,
    });
  } catch (e) {
    console.error('economy hydrate error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

function mergeLegacyShop(server: EconomyShopData, legacyInput: unknown): EconomyShopData {
  const legacy = normalizeShopData(isPlainObject(legacyInput) ? legacyInput as Partial<EconomyShopData> : {});
  const merged = normalizeShopData({
    ...server,
    owned: mergeStrings(server.owned, legacy.owned),
    trailPacks: mergeStrings(server.trailPacks, legacy.trailPacks),
    deathPacks: mergeStrings(server.deathPacks, legacy.deathPacks),
    boosterCharges: mergeNumberRecords(server.boosterCharges, legacy.boosterCharges),
    fragments: mergeNumberRecords(server.fragments, legacy.fragments),
    topUpFragments: mergeNumberRecords(server.topUpFragments, legacy.topUpFragments),
  });

  const equipped = pickEquipped(legacy.equipped, merged.owned, server.equipped);
  const equippedTrail = pickEquipped(legacy.equippedTrail, ['default', ...merged.trailPacks], server.equippedTrail);
  const equippedDeath = pickEquipped(legacy.equippedDeath, ['default', ...merged.deathPacks], server.equippedDeath);
  const focusItemId = pickFocus(server.focusItemId, legacy.focusItemId, merged);

  return normalizeShopData({
    ...merged,
    equipped,
    equippedTrail,
    equippedDeath,
    focusItemId,
  });
}

function mergeLegacyQuests(server: QuestState, legacyInput: unknown): QuestState {
  const legacy = normalizeQuestState(legacyInput);
  const next = normalizeQuestState(server);
  for (const def of QUEST_DEFS) {
    next[def.id] = {
      progress: Math.max(next[def.id].progress, legacy[def.id].progress),
      claimed: next[def.id].claimed.map((claimed, i) => Boolean(claimed || legacy[def.id].claimed[i])),
    };
  }
  return normalizeQuestState(next);
}

function mergeLegacyLevels(server: LevelState, legacyInput: unknown): LevelState {
  const legacy = normalizeLevelState(legacyInput);
  const nextBase = isHigherLevelState(legacy, server) ? legacy : server;
  const claimed = new Set([...server.claimed, ...legacy.claimed]);

  for (const level of Object.keys(LEVEL_REWARDS).map(Number)) {
    if (level <= legacy.level) claimed.add(level);
  }

  return normalizeLevelState({
    ...nextBase,
    claimed: [...claimed].sort((a, b) => a - b),
  });
}

function isHigherLevelState(a: LevelState, b: LevelState): boolean {
  if (a.level !== b.level) return a.level > b.level;
  return a.totalXp > b.totalXp;
}

function pickEquipped(preferred: string, allowed: string[], fallback: string): string {
  if (preferred && allowed.includes(preferred)) return preferred;
  if (fallback && allowed.includes(fallback)) return fallback;
  return allowed[0] || fallback;
}

function pickFocus(serverFocus: string | null, legacyFocus: string | null, shop: EconomyShopData): string | null {
  const focus = serverFocus || legacyFocus;
  if (!focus) return null;
  const meta = getCraftMeta(focus);
  if (!meta) return null;
  if (meta.type === 'skin' && shop.owned.includes(focus)) return null;
  if (meta.type === 'trail' && shop.trailPacks.includes(focus)) return null;
  if (meta.type === 'death' && shop.deathPacks.includes(focus)) return null;
  return focus;
}

function mergeStrings(a: string[], b: string[]): string[] {
  return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));
}

function mergeNumberRecords(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const output: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (key in CRAFT_CONFIG || key.startsWith('boost_')) {
      output[key] = Math.max(sanitizeNumber(a?.[key]), sanitizeNumber(b?.[key]));
    }
  }
  return output;
}

function sanitizeNumber(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
