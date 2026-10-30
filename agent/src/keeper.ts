import { ethers } from "ethers";
import { cfg, REG_ABI, log } from "./config";

async function main() {
  if (!cfg.registry || !cfg.keeperKey) throw new Error("set KEEPER_REGISTRY_ADDRESS and KEEPER_KEY");
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(cfg.keeperKey, provider);
  const reg = new ethers.Contract(cfg.registry, REG_ABI, wallet);
  log("keeper", `up as ${wallet.address}`);

  const once = async () => {
    try {
      const n = Number(await reg.jobCount());
      const ready: bigint[] = await reg.readyJobs(0, n);
      if (!ready.length) { log("keeper", `0/${n} jobs ready`); return; }
      for (const id of ready) {
        const j = await reg.jobs(id);
        try {
          // simulate first so we never burn gas on a revert
          await reg.execute.staticCall(id);
          const tx = await reg.execute(id);
          const rc = await tx.wait();
          log("keeper", `executed job ${id}`, { target: j.target, reward: j.reward.toString(), tx: rc?.hash });
        } catch (e: any) {
          log("keeper", `job ${id} skipped`, e.shortMessage || e.message);
        }
      }
    } catch (e: any) {
      log("keeper", "loop error", e.shortMessage || e.message);
    }
  };

  await once();
  if (process.argv.includes("--once")) return;
  setInterval(once, cfg.pollSec * 1000);
}

main().catch((e) => { console.error(e); process.exit(1); });
