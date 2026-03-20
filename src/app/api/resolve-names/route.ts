import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, keccak256, namehash, encodePacked } from 'viem';
import { base } from 'wagmi/chains';
const L2ResolverAbi = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'string' }] },
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

async function getBasename(address: `0x${string}`): Promise<string | null> {
  try {
    const node = getReverseNode(address);
    const name = await client.readContract({
      address: RESOLVER,
      abi: L2ResolverAbi,
      functionName: 'name',
      args: [node],
    }) as string;
    return name || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { addresses } = await req.json() as { addresses: string[] };

    const results = await Promise.all(
      addresses.map(async (address: string) => {
        const name = await getBasename(address as `0x${string}`);
        return {
          address,
          name: name ? name.replace('.base.eth', '.base') : null,
        };
      })
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
}
