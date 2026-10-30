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
    // External local Hardhat node (`npx hardhat node --port 18545`), test keys only.
    local: {
      url: "http://127.0.0.1:18545",
      chainId: 31337,
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // hardhat account 0
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // account 1
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // account 2
      ],
    },
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
