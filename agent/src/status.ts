import { ethers } from "ethers";
import { cfg, AGG_ABI, REG_ABI } from "./config";

async function main() {
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  console.log("chainId", (await provider.getNetwork()).chainId.toString(), "block", await provider.getBlockNumber());
  if (cfg.aggregator) {
    const agg = new ethers.Contract(cfg.aggregator, AGG_ABI, provider);
    for (const feed of cfg.feeds) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(feed));
      const f = await agg.feeds(id);
      let ans = "-";
      if (f.latestRound > 0n) ans = (Number((await agg.rounds(id, f.latestRound)).answer) / 1e8).toString();
      console.log(`${feed.padEnd(10)} round=${f.latestRound} answer=${ans} active=${f.active} quorum=${f.minSubmissions}`);
    }
  }
  if (cfg.registry) {
    const reg = new ethers.Contract(cfg.registry, REG_ABI, provider);
    console.log("jobs", (await reg.jobCount()).toString());
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
