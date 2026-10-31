// Registers the demo PriceBelow job on the testnet KeeperRegistry.
// Reads DEPLOYER_KEY from .env (never printed). Writes deployments/evidence.json.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const net = process.env.NETWORK || "portaldotTestnet";
const dep = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployments", `${net}.json`), "utf8"));
const rpc = process.env.PORTALDOT_RPC || "https://test-evm-rpc-v3.portaldot.dev";
const key = process.env.DEPLOYER_KEY;
if (!key) throw new Error("DEPLOYER_KEY missing");

const REG_ABI = [
  "function registerJob(address target,bytes data,uint8 trigger,uint64 interval,bytes32 feedId,int256 threshold,uint256 reward,bool oneShot) payable returns (uint256)",
  "function jobCount() view returns (uint256)",
  "function jobs(uint256) view returns (address owner,address target,bytes data,uint8 trigger,uint64 interval,uint64 lastRun,bytes32 feedId,int256 threshold,uint256 reward,uint256 balance,bool active,bool oneShot)",
  "event JobRegistered(uint256 indexed jobId,address indexed owner,address target)",
];

(async () => {
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);
  const reg = new ethers.Contract(dep.KeeperRegistry.address, REG_ABI, wallet);

  // live BTC price
  const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { signal: AbortSignal.timeout(8000) });
  const live = Number((await r.json()).data.amount);
  const threshold = BigInt(Math.round(live * 1.001 * 1e8));
  console.log("live BTC", live, "threshold", threshold.toString());

  const target = dep.DemoVault.address;
  const data = new ethers.Interface(["function enterProtectedMode()"]).encodeFunctionData("enterProtectedMode");
  const reward = ethers.parseEther("0.5");
  const feedId = dep.feeds["BTC / USD"];

  const tx = await reg.registerJob(target, data, 2, 0, feedId, threshold, reward, true, { value: reward });
  const rc = await tx.wait();
  const n = Number(await reg.jobCount());
  const job = await reg.jobs(n - 1);
  console.log("jobId", n - 1, "tx", rc.hash, "reward tPOT", ethers.formatEther(job.reward), "oneShot", job.oneShot, "threshold", job.threshold.toString());

  const evidence = {
    network: net,
    liveBtcUsd: live,
    thresholdMinor: threshold.toString(),
    jobId: n - 1,
    jobTx: rc.hash,
    rewardTPot: ethers.formatEther(job.reward),
    target,
    data,
    registeredAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(process.cwd(), "deployments", "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("wrote deployments/evidence.json");
})();
