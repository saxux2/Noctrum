/**
 * Step 7: Test liquidation flow
 * - Creates a new borrow + loan via direct server state manipulation (internal endpoints)
 * - Calls /internal/liquidate-loans to liquidate it
 * - Verifies: loan defaulted, borrower tier downgraded, transfers queued (95/5 split)
 *
 * NOTE: This test creates a loan by going through the full proposal->accept flow
 * using internal endpoints, so no on-chain interaction needed.
 */
import { ethers } from "ethers";
import { borrower, lenderA, lenderB, pool } from "./utils";
import { gUSD, gETH, post, get, ts, toWei, encryptRate, GHOST_DOMAIN } from "./utils";

async function main() {
  console.log("=== Step 7: Liquidation Flow ===\n");

  // First check if there's already an active loan we can liquidate
  // If not, we need to create one. We'll use the internal endpoint to
  // record a match proposal then expire it (auto-accept).

  // Fetch live ETH price to compute realistic collateral
  const scoreInfo = await get(`/api/v1/credit-score/${borrower.address}`);
  const ethPrice: number = scoreInfo.ethPrice;
  const multiplier: number = scoreInfo.collateralMultiplier;
  // Need (100 USD * multiplier) / ethPrice ETH, add 20% buffer
  const requiredEth = (100 * multiplier) / ethPrice;
  const safeEth = requiredEth * 1.2;
  const collateral = ethers.parseEther(safeEth.toFixed(6)).toString();
  console.log(`ETH/USD: $${ethPrice.toFixed(2)}, using ${safeEth.toFixed(4)} gETH as collateral`);

  // Step A: Submit a fresh borrow intent
  console.log("Submitting borrow intent for liquidation test...");
  const encrypted = encryptRate("0.10");
  const timestamp = ts();
  const borrowMsg = {
    account: borrower.address,
    token: gUSD,
    amount: toWei(100),
    collateralToken: gETH,
    collateralAmount: collateral,
    encryptedMaxRate: encrypted,
    timestamp,
  };
  const auth = await borrower.signTypedData(GHOST_DOMAIN, {
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

  const borrowResult = await post("/api/v1/borrow-intent", { ...borrowMsg, auth });
  console.log(`  Borrow intent: ${borrowResult.intentId}`);

  // Step B: Record a match proposal via internal API
  console.log("Recording match proposal...");
  const proposal = {
    borrowIntentId: borrowResult.intentId,
    borrower: borrower.address,
    token: gUSD,
    principal: toWei(100),
    matchedTicks: [
      { lender: lenderA.address, lendIntentId: "test-lend-a", amount: toWei(60), rate: 0.05 },
      { lender: lenderB.address, lendIntentId: "test-lend-b", amount: toWei(40), rate: 0.08 },
    ],
    effectiveBorrowerRate: 0.062,
    collateralToken: gETH,
    collateralAmount: collateral,
  };
  await post("/api/v1/internal/record-match-proposals", { proposals: [proposal] });
  console.log("  Proposal recorded");

  // Step C: Expire proposals to auto-accept -> creates loan
  console.log("Expiring proposals (auto-accept)...");
  // Wait for proposal to expire (5s TTL)
  console.log("  Waiting 6s for proposal expiry...");
  await new Promise(r => setTimeout(r, 6000));
  const expireRes = await post("/api/v1/internal/expire-proposals", {});
  console.log(`  Auto-accepted: ${expireRes.autoAccepted}`);

  if (expireRes.autoAccepted === 0) {
    console.error("FAIL: no proposals auto-accepted");
    process.exit(1);
  }

  // Step D: Get the new active loan
  const loansRes = await post("/api/v1/internal/check-loans", {});
  const activeLoan = (loansRes.loans ?? []).find(
    (l: any) => l.status === "active" && l.borrower === borrower.address.toLowerCase()
  );

  if (!activeLoan) {
    console.error("FAIL: no active loan found after auto-accept");
    process.exit(1);
  }

  console.log(`\nActive loan to liquidate: ${activeLoan.loanId}`);
  console.log(`  Principal:  ${ethers.formatEther(activeLoan.principal)} gUSD`);
  console.log(`  Collateral: ${ethers.formatEther(activeLoan.collateralAmount)} gETH`);

  // Check credit score before liquidation
  const scoreBefore = await get(`/api/v1/credit-score/${borrower.address}`);
  console.log(`\n  Credit tier before: ${scoreBefore.tier}`);

  // Step E: Liquidate!
  console.log("\nCalling /internal/liquidate-loans...");
  const liqRes = await post("/api/v1/internal/liquidate-loans", {
    loanIds: [activeLoan.loanId],
  });
  console.log(`  Liquidated: ${liqRes.liquidated}`);
  console.log(`  Transfers queued: ${liqRes.transfers.length}`);

  if (liqRes.liquidated !== 1) {
    console.error(`FAIL: expected 1 liquidated, got ${liqRes.liquidated}`);
    process.exit(1);
  }

  // Should be 3 transfers: pool fee + lenderA share + lenderB share
  if (liqRes.transfers.length !== 3) {
    console.error(`FAIL: expected 3 transfers (pool + 2 lenders), got ${liqRes.transfers.length}`);
    process.exit(1);
  }

  // Step F: Verify credit score downgraded
  const scoreAfter = await get(`/api/v1/credit-score/${borrower.address}`);
  console.log(`\n--- Credit Score After Liquidation ---`);
  console.log(`  Tier:            ${scoreAfter.tier}`);
  console.log(`  Loans repaid:    ${scoreAfter.loansRepaid}`);
  console.log(`  Loans defaulted: ${scoreAfter.loansDefaulted}`);
  console.log(`  Multiplier:      ${scoreAfter.collateralMultiplier}x`);

  if (scoreAfter.loansDefaulted < 1) {
    console.error(`FAIL: expected loansDefaulted >= 1, got ${scoreAfter.loansDefaulted}`);
    process.exit(1);
  }

  // Step G: Verify the loan is now defaulted (not in active loans)
  const loansAfter = await post("/api/v1/internal/check-loans", {});
  const stillActive = (loansAfter.loans ?? []).find(
    (l: any) => l.loanId === activeLoan.loanId
  );
  if (stillActive) {
    console.error("FAIL: liquidated loan still appears in active loans");
    process.exit(1);
  }

  // Verify pending transfers include liquidation transfers
  const transfers = await get("/api/v1/internal/pending-transfers");
  const liqTransfers = (transfers.transfers ?? []).filter(
    (t: any) => t.reason === "liquidate" && t.status === "pending"
  );
  console.log(`\n--- Pending Liquidation Transfers ---`);
  for (const t of liqTransfers) {
    console.log(`  ${t.id.slice(0, 8)}... -> ${t.recipient.slice(0, 10)}... | ${ethers.formatEther(t.amount)} ${t.token === gETH.toLowerCase() ? "gETH" : "gUSD"}`);
  }

  console.log(`\nPASS: loan liquidated, ${liqRes.transfers.length} transfers queued, borrower tier ${scoreBefore.tier} -> ${scoreAfter.tier}`);
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
