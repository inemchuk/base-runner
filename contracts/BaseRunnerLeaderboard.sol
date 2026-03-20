// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BaseRunnerLeaderboard
 * @notice On-chain leaderboard for Base Runner game.
 *         Players voluntarily submit their best score.
 *         Top 10 entries are stored on-chain.
 */
contract BaseRunnerLeaderboard {

    struct Entry {
        address player;
        uint256 score;
    }

    uint256 public constant MAX_SCORE = 1_000_000;
    uint8   public constant TOP_SIZE  = 10;

    // Best score per wallet
    mapping(address => uint256) public bestScore;

    // Top-10 leaderboard stored on-chain
    Entry[10] private _top;
    uint8 public topCount;

    event ScoreSubmitted(address indexed player, uint256 score);

    /// @notice Submit your score. Only recorded if better than your previous best.
    function submitScore(uint256 score) external {
        require(score > 0 && score <= MAX_SCORE, "Invalid score");

        // Only update if new personal best
        if (score <= bestScore[msg.sender]) return;
        bestScore[msg.sender] = score;

        emit ScoreSubmitted(msg.sender, score);

        // Try to insert into top-10
        _insertTop(msg.sender, score);
    }

    /// @notice Returns top-10 leaderboard entries (player + score).
    function getLeaderboard() external view returns (Entry[10] memory) {
        return _top;
    }

    /// @notice Returns caller's personal best score.
    function getMyBest() external view returns (uint256) {
        return bestScore[msg.sender];
    }

    // ── Internal ─────────────────────────────────────────

    function _insertTop(address player, uint256 score) internal {
        // Find if player already in top
        int8 existingIdx = -1;
        for (uint8 i = 0; i < topCount; i++) {
            if (_top[i].player == player) {
                existingIdx = int8(i);
                break;
            }
        }

        if (existingIdx >= 0) {
            // Update existing entry and re-sort
            _top[uint8(existingIdx)].score = score;
            _sortTop();
        } else {
            // Check if score beats the last entry (or list not full)
            if (topCount < TOP_SIZE || score > _top[topCount - 1].score) {
                uint8 insertAt = topCount < TOP_SIZE ? topCount : TOP_SIZE - 1;
                _top[insertAt] = Entry(player, score);
                if (topCount < TOP_SIZE) topCount++;
                _sortTop();
            }
        }
    }

    // Simple insertion sort (max 10 elements — cheap enough)
    function _sortTop() internal {
        for (uint8 i = 1; i < topCount; i++) {
            Entry memory key = _top[i];
            int8 j = int8(i) - 1;
            while (j >= 0 && _top[uint8(j)].score < key.score) {
                _top[uint8(j + 1)] = _top[uint8(j)];
                j--;
            }
            _top[uint8(j + 1)] = key;
        }
    }
}
