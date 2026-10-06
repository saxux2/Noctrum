/**
 * Step 4: Verify loan finalized + borrower withdraws gUSD to on-chain wallet
 * - Checks active loans from Ghost server
 * - Checks borrower's private vault balance (should have gUSD from disbursement)
 * - Requests withdraw ticket from external API
 * - Calls vault.withdrawWithTicket() on-chain
 * - Verifies on-chain ERC20 balance
 */
import { ethers } from "ethers";
import { borrower, lenderA, lenderB, pool, provider } from "./utils";
import {
  gUSD, gETH, VAULT_ADDRESS, ERC20_ABI, VAULT_ABI,
  post, getVaultBalances, requestWithdrawTicket,
} from "./utils";

async function main() {
  console.log("=== Step 4: Check Loan & Withdraw ===\n");

  // Check active loans
  console.log("--- Active Loans ---");
  const loansRes = await post("/api/v1/internal/check-loans", {});
  const loans = loansRes.loans ?? [];

  if (loans.length === 0) {
    console.log("  No active loans! Make sure CRE workflows (settle-loans, execute-transfers) have run.");
    process.exit(1);
  }

  for (const loan of loans) {
    console.log(`  Loan: ${loan.loanId}`);
    console.log(`    Borrower:   ${loan.borrower}`);
    console.log(`    Principal:  ${ethers.formatEther(loan.principal)} gUSD`);
    console.log(`    Collateral: ${ethers.formatEther(loan.collateralAmount)} gETH`);
    console.log(`    Rate:       ${(loan.effectiveBorrowerRate * 100).toFixed(1)}%`);
    console.log(`    Status:     ${loan.status}`);
    console.log(`    Maturity:   ${new Date(loan.maturity).toISOString()}`);
    console.log(`    Lenders:`);
    for (const tick of loan.matchedTicks) {
      console.log(`      ${tick.lender.slice(0, 10)}... | ${ethers.formatEther(tick.amount)} gUSD @ ${(tick.rate * 100).toFixed(1)}%`);
    }
  }

  // Check borrower private vault balance
  console.log("\n--- Private Vault Balances ---");
  const borrowerBal = await getVaultBalances(borrower);
  const poolBal = await getVaultBalances(pool);
  console.log(`  Borrower  gUSD: ${ethers.formatEther(borrowerBal.gUSD).padStart(10)}  gETH: ${ethers.formatEther(borrowerBal.gETH).padStart(10)}`);
  console.log(`  Pool      gUSD: ${ethers.formatEther(poolBal.gUSD).padStart(10)}  gETH: ${ethers.formatEther(poolBal.gETH).padStart(10)}`);

  const privateGUSD = BigInt(borrowerBal.gUSD);
  if (privateGUSD <= 0n) {
    console.log("\n  Borrower has no private gUSD to withdraw.");
    console.log("  Make sure execute-transfers CRE workflow has run.");
    process.exit(1);
  }

  // Withdraw: request ticket + redeem on-chain
  const withdrawAmount = borrowerBal.gUSD;
  console.log(`\n--- Withdrawing ${ethers.formatEther(withdrawAmount)} gUSD to on-chain wallet ---`);

  console.log("  Requesting withdraw ticket...");
  const ticketData = await requestWithdrawTicket(borrower, gUSD, withdrawAmount);
  console.log(`  Ticket: ${ticketData.ticket.slice(0, 40)}...`);

  console.log("  Calling vault.withdrawWithTicket on-chain...");
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  const tx = await vault.withdrawWithTicket(gUSD, withdrawAmount, ticketData.ticket);
  console.log(`  Tx: ${tx.hash}`);
  await tx.wait();
  console.log("  Confirmed!");

  // Verify on-chain balance
  console.log("\n--- Final On-Chain Balances ---");
  const gUSDContract = new ethers.Contract(gUSD, ERC20_ABI, provider);
  const gETHContract = new ethers.Contract(gETH, ERC20_ABI, provider);

  for (const { label, addr } of [
    { label: "Lender A", addr: lenderA.address },
    { label: "Lender B", addr: lenderB.address },
    { label: "Borrower", addr: borrower.address },
  ]) {
    const usd = await gUSDContract.balanceOf(addr);
    const eth = await gETHContract.balanceOf(addr);
    console.log(`  ${label.padEnd(10)} gUSD: ${ethers.formatEther(usd).padStart(10)}  gETH: ${ethers.formatEther(eth).padStart(10)}`);
  }

  console.log("\nDone! Full e2e flow complete.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
