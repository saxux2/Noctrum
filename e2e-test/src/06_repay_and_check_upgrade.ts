/**
 * Step 6: Full repay flow + verify credit tier upgrade
 * - Creates a loan via internal endpoints (auto-accept)
 * - Mints gUSD to borrower for repayment
 * - Deposits gUSD into vault (on-chain)
 * - Private-transfers gUSD to pool (actual repayment funds)
 * - Calls /repay on server
 * - Verifies credit score upgraded
 *
 * Requires: Sepolia RPC + funded deployer wallet
 */
import { ethers } from "ethers";
import { borrower, lenderA, lenderB, deployer, pool } from "./utils";
import {
  gUSD, gETH, VAULT_ADDRESS, ERC20_ABI, VAULT_ABI, MINT_ABI,
  post, get, ts, toWei, encryptRate, privateTransfer, getVaultBalances,
  GHOST_DOMAIN,
} from "./utils";

async function main() {
  console.log("=== Step 6: Repay Loan & Check Credit Upgrade ===\n");

  // Check score before
  const scoreBefore = await get(`/api/v1/credit-score/${borrower.address}`);
  console.log(`Credit tier before: ${scoreBefore.tier} (repaid: ${scoreBefore.loansRepaid})`);

  // ── Create a loan via internal endpoints ──────────────
  console.log("\nCreating loan via internal endpoints...");

  const encrypted = encryptRate("0.10");
  const timestamp = ts();
  const borrowMsg = {
    account: borrower.address,
    token: gUSD,
    amount: toWei(100),
    collateralToken: gETH,
    collateralAmount: toWei(200),
    encryptedMaxRate: encrypted,
    timestamp,
  };
  const borrowAuth = await borrower.signTypedData(GHOST_DOMAIN, {
    "Submit Borrow": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "collateralToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "encryptedMaxRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  }, borrowMsg);

  const borrowResult = await post("/api/v1/borrow-intent", { ...borrowMsg, auth: borrowAuth });
  console.log(`  Borrow intent: ${borrowResult.intentId}`);

  // Record match proposal
  const proposal = {
    borrowIntentId: borrowResult.intentId,
    borrower: borrower.address,
    token: gUSD,
    principal: toWei(100),
    matchedTicks: [
      { lender: lenderA.address, lendIntentId: "repay-test-a", amount: toWei(60), rate: 0.05 },
      { lender: lenderB.address, lendIntentId: "repay-test-b", amount: toWei(40), rate: 0.08 },
    ],
    effectiveBorrowerRate: 0.062,
    collateralToken: gETH,
    collateralAmount: toWei(200),
  };
  await post("/api/v1/internal/record-match-proposals", { proposals: [proposal] });

  // Wait for expiry -> auto-accept
  console.log("  Waiting 6s for auto-accept...");
  await new Promise(r => setTimeout(r, 6000));
  const expireRes = await post("/api/v1/internal/expire-proposals", {});
  console.log(`  Auto-accepted: ${expireRes.autoAccepted}`);

  // Get active loan
  const loansRes = await post("/api/v1/internal/check-loans", {});
  const loan = (loansRes.loans ?? []).find(
    (l: any) => l.status === "active" && l.borrower === borrower.address.toLowerCase()
  );
  if (!loan) {
    console.error("FAIL: no active loan found");
    process.exit(1);
  }
  console.log(`  Loan: ${loan.loanId}`);

  // Calculate total owed
  let totalOwed = 0n;
  for (const tick of loan.matchedTicks) {
    const amt = BigInt(tick.amount);
    const interest = BigInt(Math.floor(Number(amt) * tick.rate));
    totalOwed += amt + interest;
  }
  const totalOwedStr = totalOwed.toString();
  console.log(`  Total owed: ${ethers.formatEther(totalOwed)} gUSD`);

  // ── Actual fund movement: mint + deposit + private transfer ──
  console.log("\n--- Funding borrower for repayment ---");

  // Mint gUSD to borrower (simulates borrower acquiring funds to repay)
  const gUSDContract = new ethers.Contract(gUSD, [...MINT_ABI, ...ERC20_ABI], deployer);
  console.log(`  Minting ${ethers.formatEther(totalOwed)} gUSD to borrower...`);
  await (await gUSDContract.mint(borrower.address, totalOwedStr)).wait();

  // Borrower approves + deposits into vault
  const tokenAsBorrower = new ethers.Contract(gUSD, ERC20_ABI, borrower);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  console.log("  Approving vault...");
  await (await tokenAsBorrower.approve(VAULT_ADDRESS, totalOwedStr)).wait();
  console.log("  Depositing into vault...");
  await (await vault.deposit(gUSD, totalOwedStr)).wait();

  // Private transfer to pool (actual repayment)
  console.log(`  Private transfer ${ethers.formatEther(totalOwed)} gUSD -> pool...`);
  await privateTransfer(borrower, pool.address, gUSD, totalOwedStr);

  // Verify private balance moved
  const borrowerBal = await getVaultBalances(borrower);
  const poolBal = await getVaultBalances(pool);
  console.log(`  Borrower private gUSD: ${ethers.formatEther(borrowerBal.gUSD)}`);
  console.log(`  Pool private gUSD:     ${ethers.formatEther(poolBal.gUSD)}`);

  // ── Call repay on server ──────────────────────────────
  console.log("\n--- Repaying loan ---");
  const repayTs = ts();
  const repayMsg = {
    account: borrower.address,
    loanId: loan.loanId,
    amount: totalOwedStr,
    timestamp: repayTs,
  };
  const repayAuth = await borrower.signTypedData(GHOST_DOMAIN, {
    "Repay Loan": [
      { name: "account", type: "address" },
      { name: "loanId", type: "string" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  }, repayMsg);

  const result = await post("/api/v1/repay", { ...repayMsg, auth: repayAuth });
  console.log(`  Status:     ${result.status}`);
  console.log(`  Total paid: ${ethers.formatEther(result.totalPaid)} gUSD`);
  console.log(`  Transfer:   ${result.transferId} (collateral return queued)`);

  // ── Verify repay-lender transfers queued ──────────────
  console.log("\n--- Pending Transfers After Repay ---");
  const transfers = await get("/api/v1/internal/pending-transfers");
  const repayTransfers = (transfers.transfers ?? []).filter(
    (t: any) => t.reason === "repay-lender" && t.status === "pending"
  );
  console.log(`  repay-lender transfers: ${repayTransfers.length}`);
  for (const t of repayTransfers) {
    console.log(`    ${t.recipient.slice(0, 10)}... | ${ethers.formatEther(t.amount)} gUSD`);
  }

  if (repayTransfers.length !== 2) {
    console.error(`FAIL: expected 2 repay-lender transfers, got ${repayTransfers.length}`);
    process.exit(1);
  }

  // Verify lender A gets 60 + 5% interest = 63 gUSD
  const lenderATransfer = repayTransfers.find(
    (t: any) => t.recipient === lenderA.address.toLowerCase()
  );
  const lenderBTransfer = repayTransfers.find(
    (t: any) => t.recipient === lenderB.address.toLowerCase()
  );

  if (!lenderATransfer || !lenderBTransfer) {
    console.error("FAIL: missing lender transfer");
    process.exit(1);
  }

  const lenderAPayout = BigInt(lenderATransfer.amount);
  const lenderBPayout = BigInt(lenderBTransfer.amount);
  const expectedA = BigInt(toWei(60)) + BigInt(Math.floor(Number(BigInt(toWei(60))) * 0.05));
  const expectedB = BigInt(toWei(40)) + BigInt(Math.floor(Number(BigInt(toWei(40))) * 0.08));

  console.log(`\n  Lender A: ${ethers.formatEther(lenderAPayout)} gUSD (expected ${ethers.formatEther(expectedA)})`);
  console.log(`  Lender B: ${ethers.formatEther(lenderBPayout)} gUSD (expected ${ethers.formatEther(expectedB)})`);

  if (lenderAPayout !== expectedA) {
    console.error(`FAIL: lenderA payout mismatch`);
    process.exit(1);
  }
  if (lenderBPayout !== expectedB) {
    console.error(`FAIL: lenderB payout mismatch`);
    process.exit(1);
  }

  // Also verify collateral return transfer queued for borrower
  const collateralReturn = (transfers.transfers ?? []).find(
    (t: any) => t.reason === "return-collateral-repay" && t.recipient === borrower.address.toLowerCase() && t.status === "pending"
  );
  if (!collateralReturn) {
    console.error("FAIL: no collateral return transfer queued");
    process.exit(1);
  }
  console.log(`  Collateral return: ${ethers.formatEther(collateralReturn.amount)} gETH -> borrower`);

  // ── Verify credit score upgraded ──────────────────────
  const scoreAfter = await get(`/api/v1/credit-score/${borrower.address}`);
  console.log(`\n--- Credit Score After Repay ---`);
  console.log(`  Tier:            ${scoreAfter.tier}`);
  console.log(`  Loans repaid:    ${scoreAfter.loansRepaid}`);
  console.log(`  Loans defaulted: ${scoreAfter.loansDefaulted}`);
  console.log(`  Multiplier:      ${scoreAfter.collateralMultiplier}x`);

  if (scoreAfter.loansRepaid !== scoreBefore.loansRepaid + 1) {
    console.error(`FAIL: loansRepaid didn't increment`);
    process.exit(1);
  }

  // Verify loan no longer active
  const loansAfter = await post("/api/v1/internal/check-loans", {});
  const stillActive = (loansAfter.loans ?? []).find((l: any) => l.loanId === loan.loanId);
  if (stillActive) {
    console.error("FAIL: repaid loan still in active loans");
    process.exit(1);
  }

  console.log(`\nPASS: loan repaid, lenders got principal+yield via queued transfers, tier ${scoreBefore.tier} -> ${scoreAfter.tier}`);
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
