# PotFeeds + PotKeeper

**An agent-operated oracle and keeper network for Portaldot V3.**

Portaldot V3 mainnet went live on Oct 24, 2026, and its built-in oracle module is still empty. There's no automation layer either. Without price data and keepers, nobody can safely build lending, perps, stablecoins, vaults or stop-losses on Portaldot.

PotFeeds fills both gaps with autonomous AI agents:

- **Feeder agents** pull prices from 5 public exchanges, drop outliers, decide on their own when to publish (deviation or heartbeat), and **circuit-break a feed** when sources disagree. An optional LLM risk reviewer can veto suspicious updates and explain why.
- **FeedAggregator** (Solidity, pallet-revive EVM) takes each agent's answer per round and finalizes at the **median** once quorum is reached. It exposes a Chainlink-style `latestRoundData`, so dApps integrate in minutes.
- **Keeper agents** watch **KeeperRegistry** jobs (time-interval or price-triggered), simulate first, then execute and get paid in tPOT/POT from the job's balance.

Built for Portaldot Hacker House 2026 (tracks: Node Operations & Tooling / Modular Cloud & Middleware). Mainnet is the goal, not the hackathon.

## Architecture

```mermaid
flowchart LR
  subgraph Sources
    CB[Coinbase] & KR[Kraken] & BN[Binance] & CG[CoinGecko] & BS[Bitstamp]
  end
  Sources --> F1[Feeder agent 1] & F2[Feeder agent 2] & F3[Feeder agent 3]
  F1 & F2 & F3 -- submit(round, answer) / pauseFeed --> AGG[(FeedAggregator\nmedian per round)]
  AGG -- latestRoundData --> DAPP[dApps: lending, perps, vaults]
  AGG -- latestAnswer --> REG[(KeeperRegistry\ninterval + price jobs)]
  K[Keeper agent] -- readyJobs / execute --> REG
  REG -- call --> TGT[Target contract e.g. DemoVault]
  REG -- reward --> K
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
npm install
npm test                  # 7 contract tests on the local Hardhat chain
cp .env.example .env      # add a fresh, testnet-only DEPLOYER_KEY
npm run deploy:testnet    # writes deployments/portaldotTestnet.json
npm run feeder            # start a feeder agent (add --once for one pass)
npm run keeper            # start a keeper agent
npm run status            # print feeds, rounds and jobs
```

## Portaldot V3 testnet

| Item | Value |
|---|---|
| EVM RPC | https://test-evm-rpc-v3.portaldot.dev |
| Chain ID | 420420777 |
| Substrate WSS | wss://test-node-v3.portaldot.dev |
| Explorer | https://scanner-testnet-v3.portaldot.dev/ |
| Native token | tPOT, 14 decimals |

To fund a MetaMask (EVM) account from a SubWallet (native) account, run `node scripts/evm-to-ss58.js 0xYourEvmAddress` and send tPOT to the printed `5...` address.

## Deployed contracts (testnet)

_Filled after the first deploy, from `deployments/portaldotTestnet.json`._

| Contract | Address | Deploy tx |
|---|---|---|
| FeedAggregator | - | - |
| KeeperRegistry | - | - |
| DemoVault | - | - |

## Roadmap to mainnet

1. Testnet: 3 independent feeder agents, quorum 3, BTC/ETH/DOT feeds, live keeper demo.
2. Feeder bonding + slashing for answers far from the median; keeper rewards from job fees.
3. Native adapter: also write finalized rounds into Portaldot's built-in oracle pallet (pending feeder-permission answer from the core team) and an ink! port.
4. POT/USD feed once POT trades on enough venues.
5. Mainnet deploy as soon as a public V3 EVM RPC is published.

## License
MIT
