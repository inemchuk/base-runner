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
  // Skins (original)
  skin_cryptokid:     0,
  skin_street_runner: 1,
  skin_default:       2,
  skin_founder:       3,
  skin_base_king:     4,
  // Skins (new, 5-9 then 15-20)
  skin_1:  5,
  skin_2:  6,
  skin_3:  7,
  skin_4:  8,
  skin_5:  9,
  skin_6:  15,
  skin_7:  16,
  skin_8:  17,
  skin_9:  18,
  skin_10: 19,
  skin_11: 20,
  // Trails (10-14, unchanged)
  trail_sparkle: 10,
  trail_hearts:  11,
  trail_fire:    12,
  trail_coins:   13,
  trail_rainbow: 14,
};

export function getTokenId(itemId: string): number | undefined {
  return ITEM_TOKEN_IDS[itemId];
}
