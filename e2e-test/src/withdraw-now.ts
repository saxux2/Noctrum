/**
 * One-off: withdraw borrower's 800 nUSD private balance to on-chain ERC20
 */
import { ethers } from "ethers";
import { borrower, provider } from "./utils";
import {
  nUSD, VAULT_ADDRESS, ERC20_ABI, VAULT_ABI,
  getVaultBalances, requestWithdrawTicket,
} from "./utils";

async function main() {
  const amount = "800000000000000000000"; // 800 nUSD
  console.log(`Borrower: ${borrower.address}`);

  // Check private balance first
  const bal = await getVaultBalances(borrower);
  console.log(`Private balances: nUSD ${ethers.formatEther(bal.nUSD)}  nETH ${ethers.formatEther(bal.nETH)}`);

  // Request withdraw ticket
  console.log("\nRequesting withdraw ticket for 800 nUSD...");
  const data = await requestWithdrawTicket(borrower, nUSD, amount);
  console.log("Ticket received:", data.ticket?.slice(0, 40) + "...");

  // Redeem on-chain
  console.log("\nCalling vault.withdrawWithTicket on-chain...");
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  const tx = await vault.withdrawWithTicket(nUSD, amount, data.ticket);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Confirmed!");

  // Check on-chain balance
  const token = new ethers.Contract(nUSD, ERC20_ABI, provider);
  const onChainBal = await token.balanceOf(borrower.address);
  console.log(`\nBorrower on-chain nUSD: ${ethers.formatEther(onChainBal)}`);
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
