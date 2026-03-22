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

// Batch resolve avatars via Neynar (Farcaster pfp_url = Base app avatar)
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

const memStore = new Map<string, number>();

export async function GET() {
  try {
    let raw: Array<{ address: string; score: number }> = [];

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      const result = await redis.zrange('scores', 0, 99, { rev: true, withScores: true }) as (string | number)[];
      for (let i = 0; i < result.length; i += 2) {
        raw.push({ address: result[i] as string, score: result[i + 1] as number });
      }
    } else {
      const sorted = [...memStore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
      raw = sorted.map(([address, score]) => ({ address, score }));
    }

    // Batch resolve: basenames + avatars in parallel
    const addresses = raw.map(e => e.address);
    const [avatarMap] = await Promise.all([
      batchResolveAvatars(addresses),
    ]);

    const resolved = await Promise.all(
      raw.map(async (entry, i) => {
        const name = await getBasename(entry.address as `0x${string}`);
        return {
          rank: i + 1,
          address: entry.address,
          name: name ? name.replace('.base.eth', '.base') : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`,
          avatar: avatarMap.get(entry.address.toLowerCase()) || null,
          score: entry.score,
        };
      })
    );

    return NextResponse.json({ entries: resolved });
  } catch (e) {
    console.error('score/leaderboard error:', e);
    return NextResponse.json({ entries: [] });
  }
}
