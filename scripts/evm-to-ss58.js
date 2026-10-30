// Converts an EVM (H160) address into the Substrate account that
// pallet-revive maps it to (h160 ++ 0xEE * 12), encoded as SS58 prefix 42.
// Send native tPOT from SubWallet to the printed 5... address to fund the
// MetaMask account. Usage: node scripts/evm-to-ss58.js 0xYourMetaMaskAddress
// Verify with: eth_getBalance on the EVM RPC after the transfer.
const { blake2b } = require("ethereum-cryptography/blake2b");
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58(buf) {
  let n = BigInt("0x" + Buffer.from(buf).toString("hex")), s = "";
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

const h160 = (process.argv[2] || "").toLowerCase().replace(/^0x/, "");
if (!/^[0-9a-f]{40}$/.test(h160)) { console.error("usage: node scripts/evm-to-ss58.js 0x<40 hex>"); process.exit(1); }
const pub = Buffer.concat([Buffer.from(h160, "hex"), Buffer.alloc(12, 0xee)]);
const payload = Buffer.concat([Buffer.from([42]), pub]);
const sum = blake2b(Buffer.concat([Buffer.from("SS58PRE"), payload]), 64).slice(0, 2);
console.log(b58(Buffer.concat([payload, Buffer.from(sum)])));
