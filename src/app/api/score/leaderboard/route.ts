import { NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, namehash, encodePacked } from 'viem';
import { base } from 'wagmi/chains';

const L2ResolverAbi = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
  { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
] as const;

const RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as const;
const client = createPublicClient({ chain: base, transport: http() });

function getReverseNode(address: `0x${string}`): `0x${string}` {
  const addressFormatted = address.toLowerCase();
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  const coinType = ((2147483648 | base.id) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(['bytes32', 'bytes32'], [baseReverseNode, addressNode]));
}

async function resolveNameAndAvatar(address: `0x${string}`): Promise<{ name: string | null; avatar: string | null }> {
  try {
    // Step 1: reverse resolve address → basename
    const reverseNode = getReverseNode(address);
    const rawName = await client.readContract({
      address: RESOLVER, abi: L2ResolverAbi, functionName: 'name', args: [reverseNode],
    }) as string;

    if (!rawName) return { name: null, avatar: null };

    // Step 2: forward resolve basename → avatar (text record on the name's node)
    let avatar: string | null = null;
    try {
      const forwardNode = namehash(rawName);
      const avatarText = await client.readContract({
        address: RESOLVER, abi: L2ResolverAbi, functionName: 'text', args: [forwardNode, 'avatar'],
      }) as string;
      avatar = avatarText || null;
    } catch {
      // No avatar set
    }

    return { name: rawName, avatar };
  } catch {
    return { name: null, avatar: null };
  }
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

    // Resolve basenames + avatars
    const resolved = await Promise.all(
      raw.map(async (entry, i) => {
        const { name, avatar } = await resolveNameAndAvatar(entry.address as `0x${string}`);
        return {
          rank: i + 1,
          address: entry.address,
          name: name ? name.replace('.base.eth', '.base') : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`,
          avatar,
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
