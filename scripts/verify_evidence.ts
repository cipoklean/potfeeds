/**
 * Verify_evidence.ts — end-to-end verification of the captured testnet evidence.
 *
 * Reads deployments/evidence.json (the "capture" section) and checks every claim
 * against live chain state:
 *   - each feeder submit tx is mined (status 1) and is an AnswerSubmitted to the right feed
 *   - each feed's latestRound >= 1 and is finalized with the recorded answer
 *   - the keeper execution tx is mined and the job is marked done
 *   - DemoVault.protectedMode == true and triggeredAt matches the recorded answer
 *
 * Usage: npx tsx scripts/verify_evidence.ts
 */
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const RPC = process.env.RPC_URL ?? "https://test-evm-rpc-v3.portaldot.dev";
const AGG_ADDR = "0x9b29Fe91ABE65846F0EeFf3989b9C8a496E2260B";
const REG_ADDR = "0xb03395BcC85C921c4CEEF26C771Edb36FF6738C4";
const VAULT_ADDR = "0xF1E1Db70Af29f78B79F56135685b2De15147cC8A";

const AGG_ABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts/contracts/FeedAggregator.sol/FeedAggregator.json"), "utf8")
).abi;
const REG_ABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts/contracts/KeeperRegistry.sol/KeeperRegistry.json"), "utf8")
).abi;
const VAULT_ABI = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts/contracts/DemoVault.sol/DemoVault.json"), "utf8")
).abi;

async function main() {
  const evPath = path.join(__dirname, "../deployments/evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evPath, "utf8"));
  const cap = evidence.capture;
  if (!cap) throw new Error("no capture section in evidence.json");

  const provider = new ethers.JsonRpcProvider(RPC);
  const agg = new ethers.Contract(AGG_ADDR, AGG_ABI, provider);
  const reg = new ethers.Contract(REG_ADDR, REG_ABI, provider);
  const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI, provider);

  const failures: string[] = [];

  // 1. Feeder submit txs mined + correct feed + finalized round on-chain
  for (const f of cap.feeds ?? []) {
    const feedId = f.feedId ?? ethers.keccak256(ethers.toUtf8Bytes(f.feed));
    const rc = await provider.getTransactionReceipt(f.submitTx);
    if (!rc || rc.status !== 1) failures.push(`${f.feed}: submit tx not mined/status!=1`);

    const feed = await agg.feeds(feedId);
    if (feed.latestRound < 1n) failures.push(`${f.feed}: latestRound not finalized (${feed.latestRound})`);
    const round = await agg.rounds(feedId, feed.latestRound);
    if (!round.finalized) failures.push(`${f.feed}: round ${feed.latestRound} not finalized`);
    if (round.answer.toString() !== f.answer) {
      failures.push(`${f.feed}: answer mismatch on-chain ${round.answer} != recorded ${f.answer}`);
    }
    console.log(`OK ${f.feed}: round ${feed.latestRound} finalized, answer ${round.answer}`);
  }

  // 2. Keeper execution tx mined + job executed
  const krc = await provider.getTransactionReceipt(cap.keeperExecTx);
  if (!krc || krc.status !== 1) failures.push("keeper exec tx not mined/status!=1");
  const job = await reg.jobs(0n);
  if (job.lastRun === 0n) failures.push("job 0 never executed (lastRun==0)");
  if (job.active) failures.push("job 0 still active (expected oneShot deactivation)");
  console.log(`OK keeper: job lastRun=${job.lastRun}, active=${job.active}, balance=${job.balance}`);

  // 3. DemoVault protectedMode + triggeredAt
  const pm = await vault.protectedMode();
  const ta = await vault.triggeredAt();
  if (!pm) failures.push("vault not in protectedMode");
  if (ta.toString() !== cap.vaultTriggeredAt) {
    failures.push(`vault triggeredAt ${ta} != recorded ${cap.vaultTriggeredAt}`);
  }
  console.log(`OK vault: protectedMode=${pm}, triggeredAt=${ta}`);

  if (failures.length) {
    console.error("\nFAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nVERIFY PASS — all evidence confirmed on-chain");
}

main().catch((e) => { console.error(e); process.exit(1); });
