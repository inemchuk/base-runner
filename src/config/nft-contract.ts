// Set NEXT_PUBLIC_NFT_CONTRACT after deploying contracts/BaseRunnerItems.sol on Base.
export const NFT_CONTRACT = (process.env.NEXT_PUBLIC_NFT_CONTRACT ?? '') as `0x${string}`;
export const NFT_DEPLOYED  = NFT_CONTRACT.length === 42 && NFT_CONTRACT.startsWith('0x');

export const NFT_ABI = [
  {
    type: 'function',
    name: 'claim',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'sig',     type: 'bytes'   },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimed',
    inputs: [
      { name: 'user',    type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Game item ID → ERC-1155 tokenId
export const ITEM_TOKEN_IDS: Record<string, number> = {
  // Skins
  skin_cryptokid:     0,
  skin_street_runner: 1,
  skin_default:       2,
  skin_founder:       3,
  skin_base_king:     4,
  // Trails
  trail_sparkle: 10,
  trail_hearts:  11,
  trail_fire:    12,
  trail_coins:   13,
  trail_rainbow: 14,
};

export function getTokenId(itemId: string): number | undefined {
  return ITEM_TOKEN_IDS[itemId];
}
