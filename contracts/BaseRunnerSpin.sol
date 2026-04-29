// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Base Runner Spin
/// @notice Stateless on-chain spin recorder.
///         All game logic (spin count, coin cost, prizes) lives in Redis.
///         This contract exists solely to generate on-chain transactions.
contract BaseRunnerSpin {
    event Spun(address indexed player, uint256 timestamp);

    function spin() external {
        emit Spun(msg.sender, block.timestamp);
    }
}
