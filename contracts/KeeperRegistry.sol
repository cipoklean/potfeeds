// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFeedAggregator {
    function latestAnswer(bytes32 feedId) external view returns (int256);
}

/// @title PotKeeper KeeperRegistry
/// @notice On-chain automation for Portaldot V3. Anyone registers a job
///         (target + calldata) with a trigger and funds it with native tPOT/POT.
///         Keeper agents watch jobs and call `execute` when the trigger is met;
///         the contract pays the keeper the job's reward.
///         Triggers: time interval, or a PotFeeds price crossing a threshold.
contract KeeperRegistry {
    enum Trigger { Interval, PriceAbove, PriceBelow }

    struct Job {
        address owner;
        address target;
        bytes data;
        Trigger trigger;
        uint64 interval;    // seconds (Interval trigger)
        uint64 lastRun;
        bytes32 feedId;     // price triggers
        int256 threshold;   // price triggers
        uint256 reward;     // paid per execution, in native wei units
        uint256 balance;
        bool active;
        bool oneShot;       // deactivate after first successful run
    }

    IFeedAggregator public immutable oracle;
    Job[] public jobs;

    event JobRegistered(uint256 indexed jobId, address indexed owner, address target, Trigger trigger);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event JobExecuted(uint256 indexed jobId, address indexed keeper, bool success, uint256 reward);
    event JobCancelled(uint256 indexed jobId, uint256 refund);

    error NotReady();
    error Inactive();
    error Underfunded();
    error NotJobOwner();
    error RefundFailed();
    error PayFailed();

    constructor(address oracle_) { oracle = IFeedAggregator(oracle_); }

    function registerJob(
        address target,
        bytes calldata data,
        Trigger trigger,
        uint64 interval,
        bytes32 feedId,
        int256 threshold,
        uint256 reward,
        bool oneShot
    ) external payable returns (uint256 jobId) {
        jobId = jobs.length;
        jobs.push(Job(msg.sender, target, data, trigger, interval, 0, feedId, threshold, reward, msg.value, true, oneShot));
        emit JobRegistered(jobId, msg.sender, target, trigger);
        if (msg.value > 0) emit JobFunded(jobId, msg.value);
    }

    function fund(uint256 jobId) external payable {
        jobs[jobId].balance += msg.value;
        emit JobFunded(jobId, msg.value);
    }

    function cancel(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.owner) revert NotJobOwner();
        uint256 refund = j.balance;
        j.balance = 0;
        j.active = false;
        (bool ok, ) = j.owner.call{value: refund}("");
        if (!ok) revert RefundFailed();
        emit JobCancelled(jobId, refund);
    }

    function checkJob(uint256 jobId) public view returns (bool ready) {
        Job storage j = jobs[jobId];
        if (!j.active || j.balance < j.reward) return false;
        if (j.trigger == Trigger.Interval) return block.timestamp >= j.lastRun + j.interval;
        int256 price;
        try oracle.latestAnswer(j.feedId) returns (int256 p) { price = p; } catch { return false; }
        if (j.trigger == Trigger.PriceAbove) return price >= j.threshold;
        return price <= j.threshold;
    }

    /// @notice Returns ids of jobs ready right now (keeper agents poll this).
    function readyJobs(uint256 from, uint256 to) external view returns (uint256[] memory ids) {
        if (to > jobs.length) to = jobs.length;
        uint256[] memory tmp = new uint256[](to > from ? to - from : 0);
        uint256 k;
        for (uint256 i = from; i < to; i++) if (checkJob(i)) tmp[k++] = i;
        ids = new uint256[](k);
        for (uint256 i = 0; i < k; i++) ids[i] = tmp[i];
    }

    function execute(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (!j.active) revert Inactive();
        if (j.balance < j.reward) revert Underfunded();
        if (!checkJob(jobId)) revert NotReady();

        j.lastRun = uint64(block.timestamp);
        j.balance -= j.reward;
        if (j.oneShot) j.active = false;

        (bool success, ) = j.target.call(j.data);
        (bool paid, ) = msg.sender.call{value: j.reward}("");
        if (!paid) revert PayFailed();
        emit JobExecuted(jobId, msg.sender, success, j.reward);
    }

    function jobCount() external view returns (uint256) { return jobs.length; }
}
