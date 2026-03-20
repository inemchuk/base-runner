// Contract address — replace with your deployed address on Base mainnet
export const CHECKIN_ADDRESS = '0xEc5D45e3622F5D6E9dF9B4E7f9ddDBa95e80D763' as const;

export const CHECKIN_ABI = [
  {
    type: 'function',
    name: 'checkIn',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getState',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'lastDay', type: 'uint64' },
      { name: 'streak', type: 'uint64' },
      { name: 'total', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'players',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'lastDay', type: 'uint64' },
      { name: 'streak', type: 'uint64' },
      { name: 'total', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'CheckedIn',
    inputs: [
      { name: 'player', type: 'address', indexed: true },
      { name: 'streak', type: 'uint64', indexed: false },
      { name: 'total', type: 'uint64', indexed: false },
    ],
  },
] as const;
