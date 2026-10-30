// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PotFeeds FeedAggregator
/// @notice Multi-feeder price oracle for Portaldot V3 (pallet-revive EVM).
///         Independent AI-agent feeders submit answers per round; once
///         `minSubmissions` arrive the round finalizes at the median.
///         Read interface mirrors Chainlink's latestRoundData so dApps can
///         integrate without learning a new API.
contract FeedAggregator {
    struct Feed {
        string description;   // e.g. "BTC / USD"
        uint8 decimals;       // answer decimals (default 8)
        uint8 minSubmissions; // quorum to finalize a round
        uint32 heartbeat;     // seconds after which data is stale
        bool active;
        uint80 latestRound;
    }

    struct Round {
        int256 answer;
        uint64 startedAt;
        uint64 updatedAt;
        bool finalized;
    }

    address public owner;
    mapping(address => bool) public isFeeder;
    address[] public feeders;

    mapping(bytes32 => Feed) public feeds;
    bytes32[] public feedIds;
    mapping(bytes32 => mapping(uint80 => Round)) public rounds;
    mapping(bytes32 => mapping(uint80 => int256[])) internal submissions;
    mapping(bytes32 => mapping(uint80 => mapping(address => bool))) public submitted;

    event FeederSet(address indexed feeder, bool allowed);
    event FeedCreated(bytes32 indexed feedId, string description, uint8 decimals);
    event AnswerSubmitted(bytes32 indexed feedId, uint80 indexed roundId, address indexed feeder, int256 answer);
    event RoundFinalized(bytes32 indexed feedId, uint80 indexed roundId, int256 answer, uint256 submissions);
    event FeedPaused(bytes32 indexed feedId, address indexed by, string reason);

    error NotOwner();
    error NotFeeder();
    error UnknownFeed();
    error FeedInactive();
    error BadRound();
    error AlreadySubmitted();
    error NoData();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyFeeder() { if (!isFeeder[msg.sender]) revert NotFeeder(); _; }

    constructor() { owner = msg.sender; }

    // ---------------- admin ----------------

    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }

    function setFeeder(address feeder, bool allowed) external onlyOwner {
        if (allowed && !isFeeder[feeder]) feeders.push(feeder);
        isFeeder[feeder] = allowed;
        emit FeederSet(feeder, allowed);
    }

    function createFeed(
        string calldata description,
        uint8 decimals_,
        uint8 minSubmissions,
        uint32 heartbeat
    ) external onlyOwner returns (bytes32 feedId) {
        feedId = keccak256(bytes(description));
        require(bytes(feeds[feedId].description).length == 0, "exists");
        require(minSubmissions > 0, "quorum");
        feeds[feedId] = Feed(description, decimals_, minSubmissions, heartbeat, true, 0);
        feedIds.push(feedId);
        emit FeedCreated(feedId, description, decimals_);
    }

    function setFeedActive(bytes32 feedId, bool active) external onlyOwner {
        if (bytes(feeds[feedId].description).length == 0) revert UnknownFeed();
        feeds[feedId].active = active;
    }

    /// @notice Any feeder agent can circuit-break a feed when its sources
    ///         disagree badly (e.g. exchange outage, manipulation). Owner re-enables.
    function pauseFeed(bytes32 feedId, string calldata reason) external onlyFeeder {
        if (bytes(feeds[feedId].description).length == 0) revert UnknownFeed();
        feeds[feedId].active = false;
        emit FeedPaused(feedId, msg.sender, reason);
    }

    // ---------------- feeders ----------------

    /// @param roundId must be latestRound + 1 (the open round).
    function submit(bytes32 feedId, uint80 roundId, int256 answer) external onlyFeeder {
        Feed storage f = feeds[feedId];
        if (bytes(f.description).length == 0) revert UnknownFeed();
        if (!f.active) revert FeedInactive();
        if (roundId != f.latestRound + 1) revert BadRound();
        if (submitted[feedId][roundId][msg.sender]) revert AlreadySubmitted();

        Round storage r = rounds[feedId][roundId];
        if (r.startedAt == 0) r.startedAt = uint64(block.timestamp);
        submitted[feedId][roundId][msg.sender] = true;
        submissions[feedId][roundId].push(answer);
        emit AnswerSubmitted(feedId, roundId, msg.sender, answer);

        int256[] storage subs = submissions[feedId][roundId];
        if (subs.length >= f.minSubmissions) {
            int256 med = _median(subs);
            r.answer = med;
            r.updatedAt = uint64(block.timestamp);
            r.finalized = true;
            f.latestRound = roundId;
            emit RoundFinalized(feedId, roundId, med, subs.length);
        }
    }

    // ---------------- reads ----------------

    function latestRoundData(bytes32 feedId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        Feed storage f = feeds[feedId];
        if (f.latestRound == 0) revert NoData();
        Round storage r = rounds[feedId][f.latestRound];
        return (f.latestRound, r.answer, r.startedAt, r.updatedAt, f.latestRound);
    }

    function latestAnswer(bytes32 feedId) external view returns (int256) {
        Feed storage f = feeds[feedId];
        if (f.latestRound == 0) revert NoData();
        return rounds[feedId][f.latestRound].answer;
    }

    function isStale(bytes32 feedId) external view returns (bool) {
        Feed storage f = feeds[feedId];
        if (f.latestRound == 0) return true;
        return block.timestamp - rounds[feedId][f.latestRound].updatedAt > f.heartbeat;
    }

    function submissionCount(bytes32 feedId, uint80 roundId) external view returns (uint256) {
        return submissions[feedId][roundId].length;
    }

    function feedCount() external view returns (uint256) { return feedIds.length; }
    function feederCount() external view returns (uint256) { return feeders.length; }

    // ---------------- internal ----------------

    function _median(int256[] storage subs) internal view returns (int256) {
        uint256 n = subs.length;
        int256[] memory a = new int256[](n);
        for (uint256 i = 0; i < n; i++) a[i] = subs[i];
        // insertion sort: n is small (number of feeders)
        for (uint256 i = 1; i < n; i++) {
            int256 key = a[i];
            uint256 j = i;
            while (j > 0 && a[j - 1] > key) { a[j] = a[j - 1]; j--; }
            a[j] = key;
        }
        if (n % 2 == 1) return a[n / 2];
        return (a[n / 2 - 1] + a[n / 2]) / 2;
    }
}
