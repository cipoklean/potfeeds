const { expect } = require("chai");
const { ethers } = require("hardhat");

const id = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("PotFeeds", function () {
  let agg, reg, vault, owner, a, b, c, keeper;
  const BTC = "BTC / USD";

  beforeEach(async () => {
    [owner, a, b, c, keeper] = await ethers.getSigners();
    agg = await (await ethers.getContractFactory("FeedAggregator")).deploy();
    await agg.createFeed(BTC, 8, 3, 3600);
    for (const s of [a, b, c]) await agg.setFeeder(s.address, true);
    reg = await (await ethers.getContractFactory("KeeperRegistry")).deploy(await agg.getAddress());
    vault = await (await ethers.getContractFactory("DemoVault")).deploy(await agg.getAddress(), id(BTC));
  });

  it("finalizes a round at the median once quorum is reached", async () => {
    await agg.connect(a).submit(id(BTC), 1, 100);
    await agg.connect(b).submit(id(BTC), 1, 300);
    await expect(agg.latestAnswer(id(BTC))).to.be.revertedWithCustomError(agg, "NoData");
    await expect(agg.connect(c).submit(id(BTC), 1, 200)).to.emit(agg, "RoundFinalized").withArgs(id(BTC), 1, 200, 3);
    const r = await agg.latestRoundData(id(BTC));
    expect(r.roundId).to.equal(1n);
    expect(r.answer).to.equal(200n);
  });

  it("ignores an outlier through the median", async () => {
    await agg.connect(a).submit(id(BTC), 1, 100);
    await agg.connect(b).submit(id(BTC), 1, 101);
    await agg.connect(c).submit(id(BTC), 1, 999999);
    expect(await agg.latestAnswer(id(BTC))).to.equal(101n);
  });

  it("rejects non-feeders, double submits and wrong rounds", async () => {
    await expect(agg.connect(keeper).submit(id(BTC), 1, 1)).to.be.revertedWithCustomError(agg, "NotFeeder");
    await agg.connect(a).submit(id(BTC), 1, 1);
    await expect(agg.connect(a).submit(id(BTC), 1, 1)).to.be.revertedWithCustomError(agg, "AlreadySubmitted");
    await expect(agg.connect(b).submit(id(BTC), 2, 1)).to.be.revertedWithCustomError(agg, "BadRound");
  });

  it("lets a feeder agent circuit-break a feed", async () => {
    await expect(agg.connect(a).pauseFeed(id(BTC), "sources disagree 7%")).to.emit(agg, "FeedPaused");
    await expect(agg.connect(b).submit(id(BTC), 1, 1)).to.be.revertedWithCustomError(agg, "FeedInactive");
  });

  it("keeper executes a price-triggered job and gets paid", async () => {
    const data = vault.interface.encodeFunctionData("enterProtectedMode");
    const reward = ethers.parseEther("0.1");
    await reg.registerJob(await vault.getAddress(), data, 2 /* PriceBelow */, 0, id(BTC), 150, reward, true, { value: ethers.parseEther("1") });
    expect(await reg.checkJob(0)).to.equal(false); // no price yet
    for (const [s, p] of [[a, 140], [b, 145], [c, 141]]) await agg.connect(s).submit(id(BTC), 1, p);
    expect(await reg.checkJob(0)).to.equal(true);
    expect(await reg.readyJobs(0, 10)).to.deep.equal([0n]);
    const before = await ethers.provider.getBalance(keeper.address);
    const tx = await reg.connect(keeper).execute(0);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect(await ethers.provider.getBalance(keeper.address)).to.equal(before + reward - gas);
    expect(await vault.protectedMode()).to.equal(true);
    expect(await vault.triggeredAt()).to.equal(141n);
    await expect(reg.connect(keeper).execute(0)).to.be.revertedWithCustomError(reg, "Inactive");
  });

  it("interval job runs then waits", async () => {
    const data = vault.interface.encodeFunctionData("poke");
    await reg.registerJob(await vault.getAddress(), data, 0, 60, ethers.ZeroHash, 0, 1, false, { value: 10 });
    await reg.connect(keeper).execute(0);
    await expect(reg.connect(keeper).execute(0)).to.be.revertedWithCustomError(reg, "NotReady");
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    await reg.connect(keeper).execute(0);
    expect(await vault.pokes()).to.equal(2n);
  });

  it("owner can change minSubmissions on an existing feed", async () => {
    await expect(agg.setMinSubmissions(id(BTC), 5)).to.emit(agg, "MinSubmissionsSet").withArgs(id(BTC), 5);
    expect((await agg.feeds(id(BTC))).minSubmissions).to.equal(5);
  });

  it("setMinSubmissions reverts for zero minSubmissions or unknown feed", async () => {
    await expect(agg.setMinSubmissions(id(BTC), 0)).to.be.revertedWith("quorum");
    await expect(agg.setMinSubmissions(id("NOPE / USD"), 5)).to.be.revertedWithCustomError(agg, "UnknownFeed");
  });

  it("non-owner cannot change minSubmissions", async () => {
    await expect(agg.connect(a).setMinSubmissions(id(BTC), 5)).to.be.revertedWithCustomError(agg, "NotOwner");
  });

  it("owner can cancel and get refund", async () => {
    await reg.registerJob(await vault.getAddress(), "0x", 0, 60, ethers.ZeroHash, 0, 1, false, { value: 10 });
    await expect(reg.connect(a).cancel(0)).to.be.revertedWithCustomError(reg, "NotJobOwner");
    await expect(reg.cancel(0)).to.emit(reg, "JobCancelled").withArgs(0, 10);
  });
});
