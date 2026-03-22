import { NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, namehash, encodePacked } from 'viem';
import { base } from 'viem/chains';

const L2ResolverAbi = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
] as const;

const RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as const;
const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

function getReverseNode(address: `0x${string}`): `0x${string}` {
  const addressFormatted = address.toLowerCase();
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  const coinType = ((2147483648 | base.id) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(['bytes32', 'bytes32'], [baseReverseNode, addressNode]));
}

async function getBasename(address: `0x${string}`): Promise<string | null> {
  try {
    const node = getReverseNode(address);
    const name = await client.readContract({
      address: RESOLVER, abi: L2ResolverAbi, functionName: 'name', args: [node],
    }) as string;
    return name || null;
  } catch {
    return null;
  }
}

async function batchResolveAvatars(addresses: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (addresses.length === 0) return map;
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses.join(',')}`,
      { headers: { accept: 'application/json', 'x-api-key': 'NEYNAR_API_DOCS', 'User-Agent': 'BaseRunner/1.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const [addr, users] of Object.entries(data)) {
        const arr = users as Array<{ pfp_url?: string }>;
        if (arr?.[0]?.pfp_url) {
          map.set(addr.toLowerCase(), arr[0].pfp_url);
        }
      }
    }
  } catch {
    // fallback: no avatars
  }
  return map;
}

export async function GET() {
  try {
    let raw: Array<{ address: string; balance: number }> = [];

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const result = await redis.zrange('coin_lb', 0, 19, { rev: true, withScores: true }) as (string | number)[];
      for (let i = 0; i < result.length; i += 2) {
        raw.push({ address: result[i] as string, balance: result[i + 1] as number });
      }
    }

    const addresses = raw.map(e => e.address);
    const avatarMap = await batchResolveAvatars(addresses);

    const entries = await Promise.all(
      raw.map(async (entry, i) => {
        const name = await getBasename(entry.address as `0x${string}`);
        return {
          rank: i + 1,
          address: entry.address,
          name: name ? name.replace('.base.eth', '.base') : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`,
          avatar: avatarMap.get(entry.address.toLowerCase()) || null,
          balance: entry.balance,
        };
      })
    );

    return NextResponse.json({ entries });
  } catch (e) {
    console.error('coins/leaderboard error:', e);
    return NextResponse.json({ entries: [] });
  }
}
