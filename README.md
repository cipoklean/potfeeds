# PotFeeds + PotKeeper

**Live dashboard:** https://potfeeds.vercel.app (reads Portaldot V3 testnet directly)

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
npm test                  # 11 contract tests on the local Hardhat chain
cp .env.example .env      # add a fresh, testnet-only DEPLOYER_KEY
npm run deploy:testnet    # writes deployments/portaldotTestnet.json
npm run feeder            # start a feeder agent (add --once for one pass)
npm run keeper            # start a keeper agent
npm run status            # print feeds, rounds and jobs
npm run demo:local        # local end-to-end loop on a throwaway Hardhat node
```

## Local end-to-end demo

`npm run demo:local` boots a throwaway Hardhat node on port 18545, deploys all
three contracts, registers a `PriceBelow` job on DemoVault at 0.1% *above* live
BTC, then runs one feeder pass and one keeper pass. No testnet funds or `.env`
needed. It prints the full loop as it happens:

```
[3/6] live BTC mid=77157.40 (sources: coinbase, kraken, binance, coingecko, bitstamp), threshold=7723455740000 (0.1% above)
[4/6] [feeder] BTC / USD submit: first round {"mid":77157.4,...}
[4/6] [feeder] BTC / USD submitted round 1 {"answer":"7715740000000",...}
       round 1 finalized: answer=77157.4 USD (median), finalized=true
[5/6] [keeper] executed job 0 {"target":"0x0165...","reward":"500000000000000000",...}
       keeper balance 10000.0 -> 10000.4998... ETH (reward received)
       DemoVault: protectedMode=true, triggeredAt=7715740000000 (77157.4 USD)
```

Details: the feeder uses the real `agent/src/sources.ts` exchange gathers and
`agent/src/brain.ts` policy to decide; the keeper simulates each job
(`staticCall`) before executing. The job is `oneShot`, so it fires exactly once
and the vault ends in `protectedMode`.

## Read-only status page

`frontend/index.html` is a single static page (no build step) that shows feeds,
latest rounds and recent keeper runs straight from the testnet chain. It reads
`deployments/<network>.json` and uses `ethers` from a CDN.

```bash
# serve the repo root, then open http://localhost:8000/frontend/
python3 -m http.server 8000
```

Defaults to the testnet; override with query params:

```
/frontend/?network=portaldotTestnet&rpc=https://test-evm-rpc-v3.portaldot.dev
/frontend/?network=local&rpc=http://127.0.0.1:18545
```

It never writes — it is a read-only viewer.

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

Deployed 2026-10-31 from `deployments/testnet.json` (also kept as
`deployments/portaldotTestnet.json`). QUORUM=1, feeds BTC/ETH/DOT.

| Contract | Address | Deploy tx | Explorer |
|---|---|---|---|
| FeedAggregator | `0x9b29Fe91ABE65846F0EeFf3989b9C8a496E2260B` | `0x5b4e6ae0...` | [tx](https://scanner-testnet-v3.portaldot.dev/tx/0x5b4e6ae0eda380baba379f75eeb9c4b331e90d3a6acb050dc7fa18556633755b) |
| KeeperRegistry | `0xb03395BcC85C921c4CEEF26C771Edb36FF6738C4` | `0xc30a5aad...` | [tx](https://scanner-testnet-v3.portaldot.dev/tx/0xc30a5aade915683018175488281b5d75350838529c4870fe4a35ead5789b7352) |
| DemoVault | `0xF1E1Db70Af29f78B79F56135685b2De15147cC8A` | `0x00b0b924...` | [tx](https://scanner-testnet-v3.portaldot.dev/tx/0x00b0b9242952df7c3e42c2c836b69b3cefde02d051249e9721858d7f903a58c7) |

Also live on testnet:
- `setMinSubmissions` set to 1 for BTC/ETH/DOT (one feeder today; owner-only
  on-chain call, no redeploy — round finalization needs just 1 submission).
- Demo `PriceBelow` job registered on KeeperRegistry (job 0, threshold 0.1%
  above live BTC, `oneShot`) — tx `0x2f09075d...`.

Full deploy tx hashes:
- FeedAggregator `0x5b4e6ae0eda380baba379f75eeb9c4b331e90d3a6acb050dc7fa18556633755b`
- KeeperRegistry `0xc30a5aade915683018175488281b5d75350838529c4870fe4a35ead5789b7352`
- DemoVault `0x00b0b9242952df7c3e42c2c836b69b3cefde02d051249e9721858d7f903a58c7`

## Roadmap to mainnet

1. Testnet: 3 independent feeder agents, quorum 3, BTC/ETH/DOT feeds, live keeper demo.
2. Feeder bonding + slashing for answers far from the median; keeper rewards from job fees.
3. Native adapter: also write finalized rounds into Portaldot's built-in oracle pallet (pending feeder-permission answer from the core team) and an ink! port.
4. POT/USD feed once POT trades on enough venues.
5. Mainnet deploy as soon as a public V3 EVM RPC is published.

## License
MIT
