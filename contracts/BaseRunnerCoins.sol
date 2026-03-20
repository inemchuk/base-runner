// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BaseRunnerCoins
 * @notice On-chain coin claim tracker for Base Runner game.
 *         Players call claimCoins() after a game run to record how many
 *         coins they collected. The contract maintains a top-10 leaderboard
 *         ranked by total lifetime claimed coins.
 *
 * Deploy on Base mainnet, then paste the address into:
 *   src/config/coin-contract.ts  →  COIN_CONTRACT_ADDRESS
 */
contract BaseRunnerCoins {
    struct Entry {
        address player;
        uint256 amount; // total lifetime claimed coins
    }

    mapping(address => uint256) public totalClaimed;
    Entry[10] private _leaderboard;

    event CoinsClaimed(address indexed player, uint256 runAmount, uint256 newTotal);

    /// @notice Record coins collected in one game run.
    /// @param amount Number of coins to claim (capped at 500 per run to prevent abuse).
    function claimCoins(uint256 amount) external {
        require(amount > 0 && amount <= 500, "amount out of range");
        totalClaimed[msg.sender] += amount;
        _updateLeaderboard(msg.sender, totalClaimed[msg.sender]);
        emit CoinsClaimed(msg.sender, amount, totalClaimed[msg.sender]);
    }

    function getLeaderboard() external view returns (Entry[10] memory) {
        return _leaderboard;
    }

    // ── internal ──────────────────────────────────────────────────────────────

    function _updateLeaderboard(address player, uint256 score) internal {
        // Update in place if already on the board
        for (uint256 i = 0; i < 10; i++) {
            if (_leaderboard[i].player == player) {
                _leaderboard[i].amount = score;
                _sort();
                return;
            }
        }
        // Replace last entry if this score is better
        if (score > _leaderboard[9].amount) {
            _leaderboard[9] = Entry(player, score);
            _sort();
        }
    }

    function _sort() internal {
        for (uint256 i = 1; i < 10; i++) {
            Entry memory key = _leaderboard[i];
            int256 j = int256(i) - 1;
            while (j >= 0 && _leaderboard[uint256(j)].amount < key.amount) {
                _leaderboard[uint256(j + 1)] = _leaderboard[uint256(j)];
                j--;
            }
            _leaderboard[uint256(j + 1)] = key;
        }
    }
}
