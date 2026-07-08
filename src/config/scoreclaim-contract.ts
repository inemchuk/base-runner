// Contract address — BaseRunnerScoreClaim, deployed on Base mainnet.
export const SCORECLAIM_ADDRESS = '0x2874FF67fEA4E9fE3dfa2bcD0010eE577D63B7e2' as const;

export const SCORECLAIM_ABI = [
  {
    type: 'function',
    name: 'claimScore',
    inputs: [{ name: 'score', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'MAX_SCORE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ScoreClaimed',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'score', type: 'uint256', indexed: false },
    ],
  },
] as const;
