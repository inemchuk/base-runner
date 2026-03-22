import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, namehash, encodePacked } from 'viem';
import { base } from 'wagmi/chains';

const L2ResolverAbi = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
  { name: 'text', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
] as const;

// Same computation as onchainkit's convertReverseNodeToBytes
function getReverseNode(address: `0x${string}`): `0x${string}` {
  const addressFormatted = address.toLowerCase();
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  // Base chain id = 8453, coin type = (2147483648 | 8453) >>> 0 = 0x80002105
  const coinType = ((2147483648 | base.id) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(['bytes32', 'bytes32'], [baseReverseNode, addressNode]));
}

const RESOLVER = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD' as const;
const client = createPublicClient({ chain: base, transport: http() });

async function resolveAddress(address: `0x${string}`): Promise<{ name: string | null; avatar: string | null }> {
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

export async function POST(req: NextRequest) {
  try {
    const { addresses } = await req.json() as { addresses: string[] };

    const results = await Promise.all(
      addresses.map(async (address: string) => {
        const { name, avatar } = await resolveAddress(address as `0x${string}`);
        return {
          address,
          name: name ? name.replace('.base.eth', '.base') : null,
          avatar,
        };
      })
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
}
