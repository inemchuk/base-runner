export const LEADERBOARD_ADDRESS = '0xAABe2179Bd1404FbEF0E8DC8886764FBAbcC321F' as const;

export const LEADERBOARD_ABI = [
  {
    name: 'submitScore',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'score', type: 'uint256' }],
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
          { name: 'score', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'bestScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getMyBest',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'ScoreSubmitted',
    type: 'event',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'score', type: 'uint256', indexed: false },
    ],
  },
] as const;
