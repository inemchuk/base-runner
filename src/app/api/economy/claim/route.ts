import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, type Address } from 'viem';
import { base } from 'viem/chains';
import { CHECKIN_ABI, CHECKIN_ADDRESS } from '@/config/checkin-contract';
import { CHECKIN_REWARDS } from '@/lib/economy/config.ts';
import { grantOwnedItem } from '@/lib/economy/core.ts';
import { claimLevelReward } from '@/lib/economy/levels.ts';
import { claimQuestReward } from '@/lib/economy/quests.ts';
import { applyRewardBundle } from '@/lib/economy/rewards.ts';
import { trackEconomyEventAfter, trackRewardBundleTelemetryAfter } from '@/lib/economy/telemetry.ts';
import {
  acquireEconomyLock,
  normalizeAddress,
  readCheckinRewardState,
  readCoins,
  readLevelState,
  readQuestState,
  readShop,
  releaseEconomyLock,
  writeCheckinRewardState,
  writeCoins,
  writeLevelState,
  writeQuestState,
  writeShop,
} from '@/lib/economy/storage.ts';

const checkinClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL),
});

function dateFromUtcDay(day: number): string {
  const d = new Date(day * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const EMPTY_RESULT = {
  coinsDelta: 0,
  fragmentsAwarded: 0,
  fragmentsPooled: 0,
  boostersDelta: 0,
  xpDelta: 0,
};

export async function POST(req: NextRequest) {
  let lockKey: string | null = null;
  try {
    const body = await req.json();
    const { address, source } = body;

    if (!address || !isAddress(address) || (source !== 'checkin' && source !== 'quest' && source !== 'level')) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    // Serialize reward claims per wallet so the same level/quest/checkin reward
    // can't be granted twice by two concurrent requests reading stale state.
    lockKey = `economy_lock:${normalizeAddress(address as string)}`;
    if (!(await acquireEconomyLock(lockKey))) {
      lockKey = null; // lock is held elsewhere; don't release what we didn't take
      return NextResponse.json({ ok: false, error: 'busy' }, { status: 409 });
    }

    if (source === 'level') {
      const [shop, coins, levelState] = await Promise.all([
        readShop(address as string),
        readCoins(address as string),
        readLevelState(address as string),
      ]);
      const claimed = claimLevelReward(levelState, body.level);

      if (!claimed.ok) {
        return NextResponse.json({ ok: false, error: claimed.error, levels: claimed.state }, { status: 400 });
      }

      let nextShop = shop;
      let nextCoins = coins;
      let result: typeof EMPTY_RESULT & { unlockedItem?: string } = { ...EMPTY_RESULT };

      if (claimed.reward.type === 'bundle') {
        const applied = applyRewardBundle(shop, coins, claimed.reward.value);
        nextShop = applied.state;
        nextCoins = applied.coins;
        result = applied.result;
      } else {
        const granted = grantOwnedItem(shop, claimed.reward.value, claimed.reward.type);
        if (!granted.ok) {
          return NextResponse.json({ ok: false, error: granted.error || 'invalid_level_reward', levels: levelState }, { status: 400 });
        }
        nextShop = granted.state;
        result = { ...EMPTY_RESULT, unlockedItem: claimed.reward.value };
      }

      await Promise.all([
        writeShop(address as string, nextShop),
        writeCoins(address as string, nextCoins),
        writeLevelState(address as string, claimed.state),
      ]);

      trackEconomyEventAfter('economy_level_reward_claimed', address as string, {
        level: claimed.level,
        reward: claimed.reward,
        result,
      });
      trackRewardBundleTelemetryAfter(
        address as string,
        'level',
        claimed.reward.type === 'bundle' ? claimed.reward.value : null,
        result,
        { level: claimed.level, rewardType: claimed.reward.type },
      );

      return NextResponse.json({
        ok: true,
        source: 'level',
        level: claimed.level,
        shop: nextShop,
        coins: nextCoins,
        levels: claimed.state,
        reward: claimed.reward,
        result,
      });
    }

    if (source === 'quest') {
      const [shop, coins, questState] = await Promise.all([
        readShop(address as string),
        readCoins(address as string),
        readQuestState(address as string),
      ]);
      const claimed = claimQuestReward(
        questState,
        typeof body.questId === 'string' ? body.questId : '',
        typeof body.level === 'number' ? body.level : undefined,
      );

      if (!claimed.ok) {
        return NextResponse.json({ ok: false, error: claimed.error, quests: claimed.state }, { status: 400 });
      }

      const applied = applyRewardBundle(shop, coins, claimed.reward);

      await Promise.all([
        writeShop(address as string, applied.state),
        writeCoins(address as string, applied.coins),
        writeQuestState(address as string, claimed.state),
      ]);

      trackEconomyEventAfter('economy_quest_claimed', address as string, {
        questId: claimed.questId,
        level: claimed.level,
        reward: claimed.reward,
      });
      trackRewardBundleTelemetryAfter(address as string, 'quest', claimed.reward, applied.result, {
        questId: claimed.questId,
        level: claimed.level,
      });

      return NextResponse.json({
        ok: true,
        source: 'quest',
        questId: claimed.questId,
        level: claimed.level,
        shop: applied.state,
        coins: applied.coins,
        quests: claimed.state,
        reward: claimed.reward,
        result: applied.result,
      });
    }

    const chainState = await checkinClient.readContract({
      address: CHECKIN_ADDRESS,
      abi: CHECKIN_ABI,
      functionName: 'getState',
      args: [address as Address],
    });
    const chainLastDay = Number(chainState[0]);
    const chainStreak = Math.max(0, Number(chainState[1]) || 0);
    const chainTotal = Math.max(0, Number(chainState[2]) || 0);
    const currentDay = Math.floor(Date.now() / 86400000);
    if (chainLastDay < currentDay) {
      return NextResponse.json({ ok: false, error: 'not_checked_in_onchain' }, { status: 409 });
    }

    const [shop, coins, checkin] = await Promise.all([
      readShop(address as string),
      readCoins(address as string),
      readCheckinRewardState(address as string),
    ]);

    const today = dateFromUtcDay(chainLastDay || currentDay);
    if (checkin.lastDate === today) {
      return NextResponse.json({
        ok: true,
        alreadyClaimed: true,
        shop,
        coins,
        checkin,
        reward: null,
        result: EMPTY_RESULT,
      });
    }

    const nextStreak = Math.max(1, chainStreak || 1);
    const nextCheckin = {
      lastDate: today,
      streak: nextStreak,
      total: Math.max(checkin.total + 1, chainTotal),
    };
    const reward = CHECKIN_REWARDS[(nextStreak - 1) % CHECKIN_REWARDS.length];
    const applied = applyRewardBundle(shop, coins, reward);

    await Promise.all([
      writeShop(address as string, applied.state),
      writeCoins(address as string, applied.coins),
      writeCheckinRewardState(address as string, nextCheckin),
    ]);

    trackEconomyEventAfter('economy_checkin_claimed', address as string, {
      streak: nextStreak,
      total: nextCheckin.total,
      reward,
    });
    trackRewardBundleTelemetryAfter(address as string, 'checkin', reward, applied.result, {
      streak: nextStreak,
      total: nextCheckin.total,
    });

    return NextResponse.json({
      ok: true,
      source: 'checkin',
      shop: applied.state,
      coins: applied.coins,
      checkin: nextCheckin,
      reward,
      result: applied.result,
    });
  } catch (e) {
    console.error('economy claim error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  } finally {
    if (lockKey) await releaseEconomyLock(lockKey);
  }
}
