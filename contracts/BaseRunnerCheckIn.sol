// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Base Runner Daily Check-In
/// @notice On-chain daily check-in with streak tracking. Only gas fee, no additional cost.
contract BaseRunnerCheckIn {
    struct PlayerState {
        uint64 lastDay;   // UTC day number (block.timestamp / 86400)
        uint64 streak;    // consecutive days
        uint64 total;     // lifetime check-ins
    }

    mapping(address => PlayerState) public players;

    event CheckedIn(address indexed player, uint64 streak, uint64 total);

    /// @notice Perform daily check-in. Reverts if already checked in today.
    function checkIn() external {
        uint64 today = uint64(block.timestamp / 86400);
        PlayerState storage p = players[msg.sender];
        require(p.lastDay < today, "Already checked in today");

        if (p.lastDay == today - 1) {
            p.streak += 1;
        } else {
            p.streak = 1;
        }

        p.total += 1;
        p.lastDay = today;

        emit CheckedIn(msg.sender, p.streak, p.total);
    }

    /// @notice Get player's check-in state (view, free).
    function getState(address player) external view returns (uint64 lastDay, uint64 streak, uint64 total) {
        PlayerState memory p = players[player];
        return (p.lastDay, p.streak, p.total);
    }
}
