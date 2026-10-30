require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 1 }, viaIR: true, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {},
    portaldotTestnet: {
      url: process.env.PORTALDOT_RPC || "https://test-evm-rpc-v3.portaldot.dev",
      chainId: 420420777,
      accounts,
    },
    // Mainnet EVM RPC not published yet (Oct 30 2026). Fill PORTALDOT_MAINNET_RPC when it is.
    portaldotMainnet: {
      url: process.env.PORTALDOT_MAINNET_RPC || "http://127.0.0.1:0",
      accounts,
    },
  },
};
