import { NextRequest, NextResponse } from 'next/server';
import { keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getTokenId } from '@/config/nft-contract';
import { getBadgeProgress, isBadgeItem, parseBadgeItem } from '@/lib/badges';

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

// POST /api/nft/sign  { address, itemId }
// Returns { sig, tokenId } if the player owns the item.
export async function POST(req: NextRequest) {
  try {
    const { address, itemId } = await req.json();
    if (!address || !itemId) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const addr = (address as string).toLowerCase();

    // Achievement badges: milestone check from server state, then sign.
    // Double-mint is prevented onchain (claimed mapping in the contract).
    let tokenId: number | undefined;
    if (isBadgeItem(itemId as string)) {
      const badge = parseBadgeItem(itemId as string);
      if (!badge) {
        return NextResponse.json({ error: 'unknown item' }, { status: 400 });
      }
      const redis = await getRedis();
      const progress = await getBadgeProgress(redis, addr);
      const target = badge.category.targets[badge.tier - 1];
      if ((progress[badge.category.id] || 0) < target) {
        return NextResponse.json({ error: 'milestone not reached' }, { status: 403 });
      }
      tokenId = badge.tokenId;
    } else {
      tokenId = getTokenId(itemId as string);
    }
    if (tokenId === undefined) {
      return NextResponse.json({ error: 'unknown item' }, { status: 400 });
    }

    // Free starter items — no ownership check needed
    const isFreeItem = itemId === 'skin_cryptokid' || itemId === 'trail_default';

    if (!isFreeItem && !isBadgeItem(itemId as string)) {
      const redis = await getRedis();
      if (redis) {
        const shopData = await redis.get<{
          owned?:      string[];
          trailPacks?: string[];
        }>(`shop:${addr}`);

        const owned      = shopData?.owned      ?? [];
        const trailPacks = shopData?.trailPacks ?? [];

        const isSkin  = (itemId as string).startsWith('skin_');
        const isTrail = (itemId as string).startsWith('trail_');

        if (isSkin  && !owned.includes(itemId as string)) {
          return NextResponse.json({ error: 'skin not owned' }, { status: 403 });
        }
        if (isTrail && !trailPacks.includes(itemId as string)) {
          return NextResponse.json({ error: 'trail not owned' }, { status: 403 });
        }
      }
      // If no Redis (local dev) — skip ownership check and allow all
    }

    const signerKey = process.env.NFT_SIGNER_KEY as `0x${string}` | undefined;
    if (!signerKey) {
      return NextResponse.json({ error: 'signer not configured' }, { status: 500 });
    }

    const account = privateKeyToAccount(signerKey);

    // Must match contract: keccak256(abi.encodePacked(msg.sender, tokenId, block.chainid))
    const hash = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [address as `0x${string}`, BigInt(tokenId), BigInt(8453)], // Base chainId = 8453
      ),
    );

    const sig = await account.signMessage({ message: { raw: hash } });

    return NextResponse.json({ sig, tokenId });
  } catch (e) {
    console.error('nft/sign error:', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
