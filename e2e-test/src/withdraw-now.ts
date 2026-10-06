/**
 * One-off: withdraw borrower's 800 gUSD private balance to on-chain ERC20
 */
import { ethers } from "ethers";

const EXTERNAL_API = "https://convergence2026-token-api.cldev.cloud";
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const VAULT_ADDRESS = "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13";
const CHAIN_ID = 11155111;
const gUSD = "0xD318551FbC638C4C607713A92A19FAd73eb8f743";

const EXTERNAL_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

const VAULT_ABI = ["function withdrawWithTicket(address token, uint256 amount, bytes ticket)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const borrower = new ethers.Wallet(process.env.BORROWER_KEY!, provider);

const ts = () => Math.floor(Date.now() / 1000);

async function main() {
  const amount = "800000000000000000000"; // 800 gUSD
  console.log(`Borrower: ${borrower.address}`);

  // Check private balance first
  const balTs = ts();
  const balMsg = { account: borrower.address, timestamp: balTs };
  const balAuth = await borrower.signTypedData(EXTERNAL_DOMAIN, {
    "Retrieve Balances": [
      { name: "account", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  }, balMsg);
  const balRes = await fetch(`${EXTERNAL_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: borrower.address, timestamp: balTs, auth: balAuth }),
  });
  const balData: any = await balRes.json();
  console.log("Private balances:", balData.balances ?? []);

  // Request withdraw ticket
  console.log("\nRequesting withdraw ticket for 800 gUSD...");
  const timestamp = ts();
  const message = { account: borrower.address, token: gUSD, amount, timestamp };
  const auth = await borrower.signTypedData(EXTERNAL_DOMAIN, {
    "Withdraw Tokens": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  }, message);

  const res = await fetch(`${EXTERNAL_API}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: borrower.address, token: gUSD, amount, timestamp, auth }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Withdraw ticket failed: ${JSON.stringify(data)}`);
  console.log("Ticket received:", data.ticket?.slice(0, 40) + "...");

  // Redeem on-chain
  console.log("\nCalling vault.withdrawWithTicket on-chain...");
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  const tx = await vault.withdrawWithTicket(gUSD, amount, data.ticket);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Confirmed!");

  // Check on-chain balance
  const token = new ethers.Contract(gUSD, ERC20_ABI, provider);
  const onChainBal = await token.balanceOf(borrower.address);
  console.log(`\nBorrower on-chain gUSD: ${ethers.formatEther(onChainBal)}`);
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
