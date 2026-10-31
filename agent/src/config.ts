import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

function deployments(): Record<string, any> {
  const net = process.env.NETWORK || "portaldotTestnet";
  const p = path.join(process.cwd(), "deployments", `${net}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}
const d = deployments();

// treat the .env.example placeholder as absent so DEPLOYER_KEY is the fallback
function key(name: string): string | undefined {
  const v = process.env[name];
  return v && v !== "0x..." ? v : undefined;
}

export const cfg = {
  rpc: process.env.PORTALDOT_RPC || "https://test-evm-rpc-v3.portaldot.dev",
  aggregator: process.env.AGGREGATOR_ADDRESS || d.FeedAggregator?.address,
  registry: process.env.KEEPER_REGISTRY_ADDRESS || d.KeeperRegistry?.address,
  feederKey: key("FEEDER_KEY") || key("DEPLOYER_KEY"),
  keeperKey: key("KEEPER_KEY") || key("DEPLOYER_KEY"),
  feeds: (process.env.FEEDS || "BTC / USD,ETH / USD,DOT / USD").split(",").map((s) => s.trim()),
  deviationBps: Number(process.env.DEVIATION_BPS || 50),
  heartbeatSec: Number(process.env.HEARTBEAT_SEC || 600),
  maxSpreadBps: Number(process.env.MAX_SOURCE_SPREAD_BPS || 300),
  pollSec: Number(process.env.POLL_SEC || 30),
  decimals: 8,
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "",
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || "",
  },
};

export const AGG_ABI = [
  "function feeds(bytes32) view returns (string description,uint8 decimals,uint8 minSubmissions,uint32 heartbeat,bool active,uint80 latestRound)",
  "function rounds(bytes32,uint80) view returns (int256 answer,uint64 startedAt,uint64 updatedAt,bool finalized)",
  "function submitted(bytes32,uint80,address) view returns (bool)",
  "function submit(bytes32 feedId,uint80 roundId,int256 answer)",
  "function pauseFeed(bytes32 feedId,string reason)",
  "function isFeeder(address) view returns (bool)",
  "event RoundFinalized(bytes32 indexed feedId,uint80 indexed roundId,int256 answer,uint256 submissions)",
];

export const REG_ABI = [
  "function jobCount() view returns (uint256)",
  "function readyJobs(uint256 from,uint256 to) view returns (uint256[])",
  "function execute(uint256 jobId)",
  "function jobs(uint256) view returns (address owner,address target,bytes data,uint8 trigger,uint64 interval,uint64 lastRun,bytes32 feedId,int256 threshold,uint256 reward,uint256 balance,bool active,bool oneShot)",
];

export const log = (who: string, msg: string, extra?: unknown) =>
  console.log(`${new Date().toISOString()} [${who}] ${msg}${extra !== undefined ? " " + JSON.stringify(extra) : ""}`);
