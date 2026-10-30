import { ethers } from "ethers";
import { cfg, AGG_ABI, log } from "./config";
import { gather, analyze } from "./sources";
import { policy, review } from "./brain";

async function main() {
  if (!cfg.aggregator || !cfg.feederKey) throw new Error("set AGGREGATOR_ADDRESS and FEEDER_KEY (see .env.example)");
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const wallet = new ethers.Wallet(cfg.feederKey, provider);
  const agg = new ethers.Contract(cfg.aggregator, AGG_ABI, wallet);
  if (!(await agg.isFeeder(wallet.address))) throw new Error(`${wallet.address} is not a registered feeder`);
  log("feeder", `up as ${wallet.address}`, { feeds: cfg.feeds });

  const once = async () => {
    for (const feed of cfg.feeds) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(feed));
      try {
        const f = await agg.feeds(id);
        if (!f.active) { log("feeder", `${feed} paused, skipping`); continue; }
        const base = feed.split("/")[0].trim();
        const quotes = await gather(base);
        if (!quotes.length) { log("feeder", `${feed} no sources`); continue; }
        const a = analyze(quotes, cfg.maxSpreadBps);
        let last: number | undefined, lastUpdated: number | undefined;
        if (f.latestRound > 0n) {
          const r = await agg.rounds(id, f.latestRound);
          last = Number(r.answer) / 10 ** cfg.decimals;
          lastUpdated = Number(r.updatedAt);
        }
        const now = Math.floor(Date.now() / 1000);
        let d = policy({ feed, quotes, mid: a.mid, spreadBps: a.spreadBps, last, lastUpdated, now });
        d = await review(feed, d, quotes);
        log("feeder", `${feed} ${d.action}: ${d.reason}`, { mid: a.mid, sources: a.kept.map((q) => q.source), dropped: a.dropped.map((q) => q.source) });

        if (d.action === "pause") {
          await (await agg.pauseFeed(id, d.reason)).wait();
        } else if (d.action === "submit") {
          const round = f.latestRound + 1n;
          if (await agg.submitted(id, round, wallet.address)) { log("feeder", `${feed} already in round ${round}`); continue; }
          const answer = BigInt(Math.round(a.mid * 10 ** cfg.decimals));
          const tx = await agg.submit(id, round, answer);
          const rc = await tx.wait();
          log("feeder", `${feed} submitted round ${round}`, { answer: answer.toString(), tx: rc?.hash });
        }
      } catch (e: any) {
        log("feeder", `${feed} error`, e.shortMessage || e.message);
      }
    }
  };

  await once();
  if (process.argv.includes("--once")) return;
  setInterval(once, cfg.pollSec * 1000);
}

main().catch((e) => { console.error(e); process.exit(1); });
