# AGENTS.md: handoff for Hermes (and any coding agent)

Read this whole file before touching the repo. It's the single source of truth for this build.

## Who and what
- Owner: **cipoklean** (David), solo builder, Nigeria (WAT, UTC+1).
- Project: **PotFeeds + PotKeeper**, agent-operated oracle + keeper network on **Portaldot V3**.
- Hackathon: Portaldot Hacker House 2026 on DoraHacks: https://dorahacks.io/hackathon/portaldot-hacker-house-2026/detail
- David will continue this to Portaldot **mainnet** whether or not it wins.

## Hard rules
1. Commits are authored and committed as **cipoklean only**. No Co-authored-by trailers, no bot or agent identity.
2. **Never** commit `.env`, private keys, seed phrases or mnemonics. Use fresh testnet-only keys. If a key ever appears in chat or a commit, treat it as burned.
3. Ask David before: pushing to `main` with large changes, deploying, spending tokens, deleting anything, posting publicly (Discord, X, DoraHacks).
4. Keep the oracle integration and decimal handling **modular** (core team hasn't answered the open questions yet).
5. Prefer small, frequent, meaningful commits. Judges require >=3 commits between Oct 14 and Nov 6, 2026, and core code must not all land in the last 24 hours.

## Deadlines (all WAT)
- **Final submission / code freeze: Thu Nov 6, 2026, 05:00 WAT (04:00 UTC).** Plan to submit by Nov 5 evening.
- Demo day: Nov 8 to 9 (Discord). Winners: Nov 11.
- A second check-in wave for late joiners exists; closing date unknown. David must complete it (ask in Discord if unsure).

## Submission requirements (DoraHacks)
- Deployed on Portaldot V3 testnet with contract addresses + tx hashes (in README table).
- Public GitHub repo, README with deploy steps + architecture diagram.
- Demo video <= 3 minutes, runnable demo, pitch deck.
- Judging: Technical 30, Innovation 30, Ecosystem impact 20, Business/sustainability 20.

## Network facts
- Testnet EVM RPC `https://test-evm-rpc-v3.portaldot.dev`, chain ID `420420777`, symbol `tPOT`.
- Testnet Substrate WSS `wss://test-node-v3.portaldot.dev` (also answers HTTP JSON-RPC POST on `https://test-node-v3.portaldot.dev`).
- Explorer `https://scanner-testnet-v3.portaldot.dev/`. Mainnet explorer `https://scanner-live-v3.portaldot.dev/`, bridge `https://bridge.portaldot.dev`, node console `https://node-console.portaldot.dev`.
- EVM is pallet-revive behind `eth-rpc`. A dry-run `eth_estimateGas` of plain `solc` bytecode succeeded on Oct 30, 2026, so standard Hardhat + solc 0.8.24 is expected to deploy. If deploy fails, try `@parity/hardhat-polkadot` with `resolc` (PolkaVM) as the fallback.
- Native tPOT has 14 decimals. EVM-side scaling is unconfirmed.
- David's native testnet wallet (public, safe to share): `5FUPTPHYakDPBwNwTDM152DvJ6C8UQEG5tbmtm8AFuv5A2cx`, funded with **500 tPOT** on Oct 30, 2026.
- To fund an EVM (MetaMask) address: `node scripts/evm-to-ss58.js 0x<evm>` prints the mapped `5...` account; send tPOT there from SubWallet; confirm with `eth_getBalance`.

## Repo map
- `contracts/FeedAggregator.sol`, `contracts/KeeperRegistry.sol`, `contracts/DemoVault.sol`
- `test/potfeeds.test.js` (7 passing tests: `npm test`)
- `scripts/deploy.js` (deploys all three, creates feeds, writes `deployments/<network>.json`)
- `scripts/evm-to-ss58.js`
- `agent/src/` feeder, keeper, brain (policy + optional LLM), sources, status
- `docs/ARCHITECTURE.md`

## Current status (Oct 30, 2026)
- [x] Idea chosen, research done (no other oracle or keeper project among ~67 builds).
- [x] Contracts + tests (**10 passing locally**), feeder/keeper agents, live source fetch verified (BTC from Coinbase, Kraken, CoinGecko, Bitstamp; Binance may be geo-blocked).
- [x] Bytecode shrink: optimizer runs 1 + viaIR on, leftover require strings swapped for custom errors, unused aggregator views dropped (FeedAggregator 6221 → 3992 creation bytes; KeeperRegistry 4616 → 3674; DemoVault 916 → 958; all 10 tests pass).
- [ ] Fund a fresh EVM deployer key with tPOT (see funding step) — **in progress: asked team for more tPOT; do not deploy until funded**.
- [ ] `npm run deploy:testnet`, then paste addresses + tx hashes into README.
- [ ] Run 3 feeder agents with 3 different keys (`EXTRA_FEEDERS` at deploy, then `QUORUM=3`), or redeploy with quorum 3.
- [ ] Register a PriceBelow job on DemoVault + an Interval job; run keeper; capture tx hashes.
- [ ] Run feeder + keeper as systemd user services on the Oracle Cloud ARM VM (Hermes host).
- [ ] Small dashboard page (optional): feeds, rounds, agent decisions, keeper runs.
- [ ] Demo video (<=3 min), pitch deck, DoraHacks BUIDL submission.

## Deploy cost model (from live `eth_estimateGas`, Oct 30 2026)
- Cost ≈ **18 tPOT base + ~0.08 tPOT per creation byte** (unconfirmed; likely a held storage deposit). After shrink: FeedAggregator ~330, KeeperRegistry ~294, DemoVault ~76 tPOT at base fee (~26.1k wei) → total ~700 tPOT.
- **No EVM transaction exists on the V3 testnet yet.** The explorer shows 1,713 native Substrate extrinsics and zero EVM txs — ours could be the first. `eth_sendRawTransaction` rejects hand-set EVM-scale gas limits (node meters at PolkaVM scale, ~470B gas for a transfer); always use the node's `eth_estimateGas` × 2.
- Deployer balance 101.9 tPOT is insufficient for even one contract deploy (>70 tPOT for the smallest, DemoVault). Funding requested from the team.

## Suggested schedule
- Oct 31: fund deployer, deploy to testnet, first live rounds.
- Nov 1: 3 feeders + keeper running on VM; jobs registered.
- Nov 2: dashboard + LLM rationale logging.
- Nov 3: hardening (bonding/slashing design doc, native-pallet adapter interface).
- Nov 4: deck + video script; record.
- Nov 5: submit on DoraHacks. Buffer until Nov 6 05:00 WAT.

## Open questions waiting on the Portaldot team
1. Who can submit to the built-in oracle module?
2. Use the native oracle or deploy our own contract?
3. Public V3 mainnet EVM endpoint?
4. How the 14 native decimals map on the EVM side?
Log any answers in this file under a new "Answers" heading.

## Answers / findings
- Oct 31, 2026: EVM funding via the mapped twin works. Sending 2 tPOT natively (SubWallet) to `node scripts/evm-to-ss58.js <0x>` output made `eth_getBalance` show 1.9e18 wei. So EVM side uses 18 decimals at 1:1 value with native tPOT (14 decimals scaled by 10^4); ~0.1 tPOT appears held back, most likely the existential deposit (inferred, not documented).
- David's deployer is his own MetaMask testnet wallet; he adds DEPLOYER_KEY to `.env` himself. Never ask for or print it.
- Project name is TBD; "PotFeeds" is a working title.
