// Deploy BaseRunnerSpin on Base, then paste the address here.
// Solidity source: contracts/BaseRunnerSpin.sol
export const SPIN_ADDRESS = '0xeFE3A73E1babd6FD8fd743f2D0A29474E3565985' as const;

export const SPIN_ABI = [
  {
    type: 'function',
    name: 'spin',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Spun',
    inputs: [
      { name: 'player',    type: 'address', indexed: true  },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** Cost in coins for the next spin given how many have been done today. */
export function spinCost(spinsToday: number): number {
  return spinsToday * 50;
}
