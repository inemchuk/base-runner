import { NextRequest, NextResponse } from 'next/server';
import {
  buyBoosterPack,
  buyDailyFragmentChest,
  buyShopItem,
  craftItem,
  setFocus,
  topUpFragments,
} from '@/lib/economy/core.ts';
import { DAILY_FRAGMENT_CHEST } from '@/lib/economy/config.ts';
import {
  readCoins,
  readDailyFragmentChestState,
  readShop,
  writeCoins,
  writeDailyFragmentChestState,
  writeShop,
} from '@/lib/economy/storage.ts';
import { trackEconomyEventAfter } from '@/lib/economy/telemetry.ts';

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get('address');
    if (!address) return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });

    const [shop, coins] = await Promise.all([
      readShop(address),
      readCoins(address),
    ]);
    return NextResponse.json({ ok: true, shop, coins });
  } catch (e) {
    console.error('economy GET error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, action, itemId } = body;
    if (!address || !action || (action !== 'dailyFragmentChest' && !itemId)) {
      return NextResponse.json({ ok: false, error: 'invalid params' }, { status: 400 });
    }

    const [shop, coins] = await Promise.all([
      readShop(address as string),
      readCoins(address as string),
    ]);

    if (action === 'dailyFragmentChest') {
      const today = currentUtcDate();
      const chest = await readDailyFragmentChestState(address as string);
      const buysToday = chest.lastDate === today ? chest.buysToday : 0;
      if (buysToday >= DAILY_FRAGMENT_CHEST.limitPerDay) {
        return NextResponse.json({
          ok: false,
          error: 'daily_chest_claimed',
          shop,
          coins,
          chest: { ...chest, lastDate: today, buysToday },
        }, { status: 400 });
      }

      const result = buyDailyFragmentChest(shop, coins);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, shop: result.state, coins, chest }, { status: 400 });
      }

      const nextCoins = Math.max(0, coins + result.coinsDelta);
      const nextChest = {
        lastDate: today,
        buysToday: buysToday + 1,
        total: chest.total + 1,
      };

      await Promise.all([
        writeShop(address as string, result.state),
        writeCoins(address as string, nextCoins),
        writeDailyFragmentChestState(address as string, nextChest),
      ]);

      trackEconomyEventAfter('economy_coin_spent', address as string, {
        sink: 'daily_fragment_chest',
        amount: Math.abs(result.coinsDelta),
        balanceAfter: nextCoins,
        itemId: shop.focusItemId,
      });
      trackEconomyEventAfter('economy_fragment_earned', address as string, {
        source: 'daily_fragment_chest',
        itemId: shop.focusItemId,
        amount: result.fragmentsDelta || 0,
      });

      return NextResponse.json({
        ok: true,
        result: { coinsDelta: result.coinsDelta, fragmentsDelta: result.fragmentsDelta || 0 },
        shop: result.state,
        coins: nextCoins,
        chest: nextChest,
      });
    }

    const result =
      action === 'setFocus'
        ? setFocus(shop, itemId as string)
        : action === 'topUp'
          ? topUpFragments(shop, itemId as string, coins)
          : action === 'craft'
            ? craftItem(shop, itemId as string, coins)
            : action === 'buyItem'
              ? buyShopItem(shop, itemId as string, coins)
              : action === 'buyBoosterPack'
                ? buyBoosterPack(shop, itemId as string, coins)
                : null;

    if (!result) {
      return NextResponse.json({ ok: false, error: 'invalid action', shop, coins }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, shop: result.state, coins }, { status: 400 });
    }

    const nextCoins = Math.max(0, coins + result.coinsDelta);
    await writeShop(address as string, result.state);
    if (result.coinsDelta !== 0) await writeCoins(address as string, nextCoins);

    if (action === 'setFocus') {
      trackEconomyEventAfter('economy_focus_set', address as string, {
        itemId,
        previousItem: shop.focusItemId,
        currentProgress: result.state.fragments[itemId as string] || 0,
      });
      if (shop.focusItemId && shop.focusItemId !== itemId) {
        trackEconomyEventAfter('economy_focus_switched', address as string, {
          fromItem: shop.focusItemId,
          toItem: itemId,
          oldProgress: shop.fragments[shop.focusItemId] || 0,
          newProgress: result.state.fragments[itemId as string] || 0,
        });
      }
    }

    if (result.coinsDelta < 0) {
      trackEconomyEventAfter('economy_coin_spent', address as string, {
        sink: action,
        amount: Math.abs(result.coinsDelta),
        balanceAfter: nextCoins,
        itemId,
      });
    }

    if (action === 'topUp' && (result.fragmentsDelta || 0) > 0) {
      trackEconomyEventAfter('economy_fragment_earned', address as string, {
        source: 'top_up',
        itemId,
        amount: result.fragmentsDelta || 0,
      });
    }

    if (action === 'craft') {
      trackEconomyEventAfter('economy_craft_completed', address as string, {
        itemId,
        fragmentsUsed: Math.abs(result.fragmentsDelta || 0),
        coinsSpent: Math.abs(result.coinsDelta),
      });
    }

    if (action === 'buyItem') {
      trackEconomyEventAfter('economy_shop_item_purchased', address as string, {
        itemId,
        coinsSpent: Math.abs(result.coinsDelta),
      });
    }

    if (action === 'buyBoosterPack') {
      trackEconomyEventAfter('economy_booster_pack_purchased', address as string, {
        boosterId: itemId,
        packSize: result.boostersDelta || 0,
        coinsSpent: Math.abs(result.coinsDelta),
      });
    }

    return NextResponse.json({
      ok: true,
      result: {
        coinsDelta: result.coinsDelta,
        fragmentsDelta: result.fragmentsDelta || 0,
        boostersDelta: result.boostersDelta || 0,
      },
      shop: result.state,
      coins: nextCoins,
    });
  } catch (e) {
    console.error('economy POST error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
