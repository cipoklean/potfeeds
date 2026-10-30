# Architecture

## Contracts (`contracts/`)

### FeedAggregator.sol
- Owner registers feeder addresses (`setFeeder`) and feeds (`createFeed(description, decimals, minSubmissions, heartbeat)`). `feedId = keccak256(description)`, e.g. `keccak256("BTC / USD")`.
- Rounds are sequential. The open round is `latestRound + 1`. Each feeder submits once per round. When `minSubmissions` answers arrive, the round finalizes at the median (even count: mean of the middle two).
- Any feeder can `pauseFeed(feedId, reason)` (circuit breaker). Only the owner re-activates (`setFeedActive`).
- Reads: `latestRoundData(feedId)` (Chainlink shape), `latestAnswer`, `isStale`.
- Answers use 8 decimals (USD prices), independent of the native token's decimals.

### KeeperRegistry.sol
- `registerJob(target, data, trigger, interval, feedId, threshold, reward, oneShot)` payable. Triggers: `0 Interval`, `1 PriceAbove`, `2 PriceBelow` (reads FeedAggregator).
- `checkJob(id)` / `readyJobs(from, to)` for keepers. `execute(id)` re-checks the trigger, calls the target, pays `reward` to the caller. The target call's failure doesn't revert the payment (emitted as `success=false`) so keepers can't be griefed.
- `fund(id)`, `cancel(id)` (owner refund).

### DemoVault.sol
Demo consumer: `enterProtectedMode()` records the current BTC price (stop-loss), `poke()` counts interval runs.

## Agents (`agent/src/`)
- `sources.ts`: 5 keyless public price APIs, `gather`, `median`, `analyze` (outlier drop + spread).
- `brain.ts`: decision policy (submit / skip / pause) + optional OpenAI-compatible LLM review (veto + rationale). Works without an LLM.
- `feeder.ts`: loop per feed: gather, analyze, decide, submit or pause.
- `keeper.ts`: loop: `readyJobs`, `staticCall` simulate, `execute`.
- `status.ts`: prints chain, feeds, rounds, jobs.
- Config from `.env` and `deployments/<NETWORK>.json`.

## Decimals
- Native POT/tPOT: 14 decimals (`system_properties`). The EVM side reports balances through eth-rpc; the exact scaling between native planck and EVM wei is undocumented (asked the core team Oct 30, 2026). Keeper rewards are stored in whatever unit `msg.value` arrives in, so the contracts don't depend on it. Measure on testnet before pricing rewards.

## Known unknowns (as of Oct 30, 2026)
- Who may write to Portaldot's built-in oracle pallet; whether builders should use it or their own contract.
- Public V3 mainnet EVM RPC (not published).
- V3 developer docs (in progress).
