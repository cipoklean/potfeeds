// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracle {
    function latestAnswer(bytes32 feedId) external view returns (int256);
}

/// @notice Tiny demo consumer: a "stop-loss" switch that a keeper flips when
///         the PotFeeds price falls below a threshold, plus a counter for
///         interval jobs. Used in the demo video to show the full loop.
contract DemoVault {
    IOracle public immutable oracle;
    bytes32 public immutable feedId;
    bool public protectedMode;
    int256 public triggeredAt;
    uint256 public pokes;

    event ProtectedModeOn(int256 price);
    event Poked(uint256 count);

    constructor(address oracle_, bytes32 feedId_) { oracle = IOracle(oracle_); feedId = feedId_; }

    function enterProtectedMode() external {
        int256 p = oracle.latestAnswer(feedId);
        protectedMode = true;
        triggeredAt = p;
        emit ProtectedModeOn(p);
    }

    function poke() external { pokes++; emit Poked(pokes); }
}
