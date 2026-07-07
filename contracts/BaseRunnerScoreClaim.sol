// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BaseRunnerScoreClaim
 * @notice Lets a player emit their run score onchain as an activity signal.
 *         Stores nothing — the real leaderboard lives off-chain.
 */
contract BaseRunnerScoreClaim {
    uint256 public constant MAX_SCORE = 1_000_000;

    event ScoreClaimed(address indexed player, uint256 score);

    function claimScore(uint256 score) external {
        require(score > 0 && score <= MAX_SCORE, "Invalid score");
        emit ScoreClaimed(msg.sender, score);
    }
}
