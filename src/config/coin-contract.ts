// TODO: задеплой contracts/BaseRunnerCoins.sol на Base mainnet
//       и замени адрес ниже на настоящий.
export const COIN_CONTRACT_ADDRESS = '0xb7a9956EE59d15f287fe057524b95f328cB07506' as const;

export const COIN_CONTRACT_ABI = [
  {
    name: 'claimCoins',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getLeaderboard',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[10]',
        components: [
          { name: 'player', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'totalClaimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'CoinsClaimed',
    type: 'event',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'runAmount', type: 'uint256', indexed: false },
      { name: 'newTotal', type: 'uint256', indexed: false },
    ],
  },
] as const;
