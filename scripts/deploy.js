// Deploys FeedAggregator + KeeperRegistry + DemoVault, creates default feeds,
// registers the deployer as first feeder, writes deployments/<network>.json.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`network=${network.name} deployer=${deployer.address} balance=${ethers.formatEther(bal)}`);

  const Agg = await ethers.getContractFactory("FeedAggregator");
  const agg = await Agg.deploy();
  await agg.waitForDeployment();
  const aggAddr = await agg.getAddress();
  console.log("FeedAggregator", aggAddr, agg.deploymentTransaction().hash);

  const quorum = Number(process.env.QUORUM || 1); // raise to 3 once 3 feeder agents run
  const feeds = (process.env.FEEDS || "BTC / USD,ETH / USD,DOT / USD").split(",").map((s) => s.trim());
  for (const d of feeds) {
    const tx = await agg.createFeed(d, 8, quorum, 3600);
    await tx.wait();
    console.log("feed", d, ethers.keccak256(ethers.toUtf8Bytes(d)));
  }
  const feeders = [deployer.address, ...(process.env.EXTRA_FEEDERS || "").split(",").filter(Boolean)];
  for (const f of feeders) await (await agg.setFeeder(f, true)).wait();

  const Reg = await ethers.getContractFactory("KeeperRegistry");
  const reg = await Reg.deploy(aggAddr);
  await reg.waitForDeployment();
  const regAddr = await reg.getAddress();
  console.log("KeeperRegistry", regAddr, reg.deploymentTransaction().hash);

  const btc = ethers.keccak256(ethers.toUtf8Bytes(feeds[0]));
  const Vault = await ethers.getContractFactory("DemoVault");
  const vault = await Vault.deploy(aggAddr, btc);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("DemoVault", vaultAddr, vault.deploymentTransaction().hash);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    FeedAggregator: { address: aggAddr, tx: agg.deploymentTransaction().hash },
    KeeperRegistry: { address: regAddr, tx: reg.deploymentTransaction().hash },
    DemoVault: { address: vaultAddr, tx: vault.deploymentTransaction().hash },
    feeds: Object.fromEntries(feeds.map((d) => [d, ethers.keccak256(ethers.toUtf8Bytes(d))])),
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
