// Local end-to-end demo:
//   hardhat node  ->  deploy (scripts/deploy.js --network local)  ->  register a
//   PriceBelow job on DemoVault just above live BTC  ->  feeder --once (fetch/decide/
//   submit)  ->  keeper --once (execute + reward). Prints the full loop.
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { gather, analyze } from "../agent/src/sources";

const ROOT = path.join(__dirname, "..");
const PORT = 18545;
const RPC = `http://127.0.0.1:${PORT}`;
const NETWORK = "local";

// Hardhat node's well-known test keys (never used for anything real).
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // account 0
const KEEPER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // account 1

const AGG_ABI = [
  "function feeds(bytes32) view returns (string description,uint8 decimals,uint8 minSubmissions,uint32 heartbeat,bool active,uint80 latestRound)",
  "function rounds(bytes32,uint80) view returns (int256 answer,uint64 startedAt,uint64 updatedAt,bool finalized)",
];
const REG_ABI = [
  "function registerJob(address target,bytes data,uint8 trigger,uint64 interval,bytes32 feedId,int256 threshold,uint256 reward,bool oneShot) payable returns (uint256 jobId)",
  "function jobs(uint256) view returns (address owner,address target,bytes data,uint8 trigger,uint64 interval,uint64 lastRun,bytes32 feedId,int256 threshold,uint256 reward,uint256 balance,bool active,bool oneShot)",
];
const VAULT_ABI = ["function protectedMode() view returns (bool)", "function triggeredAt() view returns (int256)"];

function run(cmd: string, args: string[], env: Record<string, string> = {}, label = cmd) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
    child.stderr.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`))));
    child.on("error", reject);
  });
}

async function waitForNode() {
  const provider = new ethers.JsonRpcProvider(RPC);
  for (let i = 0; i < 60; i++) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("hardhat node did not come up");
}

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log(" PotFeeds local end-to-end demo");
  console.log("══════════════════════════════════════════\n");

  // 1. boot local node
  console.log("[1/6] starting hardhat node on :" + PORT);
  let node: ChildProcess;
  node = spawn("npx", ["hardhat", "node", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  node.stdout?.on("data", () => {});
  node.stderr?.on("data", (d) => process.stderr.write(`[node] ${d}`));
  await waitForNode();
  console.log("    node up\n");

  try {
    // 2. deploy
    console.log("[2/6] deploying (FeedAggregator + KeeperRegistry + DemoVault)");
    await run("npx", ["hardhat", "run", "scripts/deploy.js", "--network", NETWORK], {}, "deploy");
    const dep = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", `${NETWORK}.json`), "utf8"));
    const aggAddr = dep.FeedAggregator.address;
    const regAddr = dep.KeeperRegistry.address;
    const vaultAddr = dep.DemoVault.address;
    const btcFeed = dep.feeds["BTC / USD"];
    console.log(`    aggregator=${aggAddr}\n    registry=${regAddr}\n    vault=${vaultAddr}\n    feed(BTC / USD)=${btcFeed}\n`);

    // 3. live BTC price + register PriceBelow job just above it
    console.log("[3/6] fetching live BTC price + registering PriceBelow job just above it");
    const quotes = await gather("BTC");
    const a = analyze(quotes, 300);
    if (!a.kept.length) throw new Error("no live BTC quotes");
    const mid = a.mid;
    const threshold = BigInt(Math.round(mid * 1.001 * 1e8)); // 0.1% above live => fires when price dips/equal
    console.log(`    live BTC mid=${mid.toFixed(2)} (sources: ${a.kept.map((q) => q.source).join(", ")}), threshold=${threshold} (0.1% above)`);
    const provider = new ethers.JsonRpcProvider(RPC);
    const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
    const reg = new ethers.Contract(regAddr, REG_ABI, deployer);
    const reward = ethers.parseEther("0.5");
    const data = new ethers.Interface(["function enterProtectedMode()"]).encodeFunctionData("enterProtectedMode");
    const tx = await reg.registerJob(vaultAddr, data, 2 /* PriceBelow */, 0, btcFeed, threshold, reward, true, {
      value: reward,
    });
    const rc = await tx.wait();
    console.log(`    job registered (id 0), reward=0.5 ETH, oneShot, tx=${rc?.hash}\n`);

    // 4. feeder
    console.log("[4/6] feeder agent (fetch -> decide -> submit)");
    await run("npx", ["tsx", "agent/src/feeder.ts", "--once"], {
      NETWORK,
      PORTALDOT_RPC: RPC,
      FEEDER_KEY: DEPLOYER_KEY,
      FEEDS: "BTC / USD",
    }, "feeder");

    // 5. verify finalize
    const agg = new ethers.Contract(aggAddr, AGG_ABI, provider);
    const f = await agg.feeds(btcFeed);
    const round = await agg.rounds(btcFeed, f.latestRound);
    const price = Number(round.answer) / 1e8;
    console.log(`    round ${f.latestRound} finalized: answer=${price} USD (median), finalized=${round.finalized}\n`);
    if (!round.finalized) throw new Error("round did not finalize");

    // 6. keeper
    console.log("[5/6] keeper agent (simulate -> execute -> reward)");
    const keeperWallet = new ethers.Wallet(KEEPER_KEY, provider);
    const before = await provider.getBalance(keeperWallet.address);
    await run("npx", ["tsx", "agent/src/keeper.ts", "--once"], {
      NETWORK,
      PORTALDOT_RPC: RPC,
      KEEPER_KEY,
    }, "keeper");
    const after = await provider.getBalance(keeperWallet.address);
    const job = await reg.jobs(0);
    const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
    const protectedMode = await vault.protectedMode();
    const triggeredAt = await vault.triggeredAt();
    console.log(`    keeper balance ${ethers.formatEther(before)} -> ${ethers.formatEther(after)} ETH (reward received)`);
    console.log(`    job 0: active=${job.active}, balance=${ethers.formatEther(job.balance)} ETH, lastRun=${job.lastRun}`);
    console.log(`    DemoVault: protectedMode=${protectedMode}, triggeredAt=${triggeredAt} (${Number(triggeredAt) / 1e8} USD)\n`);

    // 7. summary
    console.log("[6/6] LOOP COMPLETE: fetch -> decide -> submit -> finalize -> keeper execute -> reward");
    console.log("─────────────── demo done ───────────────\n");
  } finally {
    node.kill();
  }
}

main().catch((e) => {
  console.error("demo failed:", e.message);
  process.exit(1);
});
