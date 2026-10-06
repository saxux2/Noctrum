/**
 * Step 8: Test collateral requirement enforcement by credit tier
 * - Fetches live ETH/USD price from credit-score endpoint
 * - Submits a borrow intent with insufficient collateral (0.01 gETH for 100 gUSD)
 * - Expects rejection with USD-denominated details
 * - Then submits with sufficient collateral computed from live price
 */
import { ethers } from "ethers";
import { borrower } from "./utils";
import { gUSD, gETH, post, get, ts, toWei, encryptRate, GHOST_DOMAIN, SERVER } from "./utils";

async function main() {
  console.log("=== Step 8: Collateral Tier Check (Price-Based) ===\n");

  // Fetch live ETH price + tier info
  const score = await get(`/api/v1/credit-score/${borrower.address}`);
  console.log(`Borrower tier: ${score.tier} (multiplier: ${score.collateralMultiplier}x)`);
  console.log(`Live ETH/USD:  $${score.ethPrice.toFixed(2)}`);

  const borrowAmount = toWei(100); // 100 gUSD
  // 0.01 gETH — always insufficient (worth ~$25 at $2500/ETH vs 100*multiplier required)
  const lowCollateral = ethers.parseEther("0.01").toString();

  const encrypted = encryptRate("0.10");

  // ── Test 1: Should REJECT insufficient collateral ──
  console.log("\nTest 1: Submit with insufficient collateral (0.01 gETH)...");
  const timestamp = ts();
  const borrowMsg = {
    account: borrower.address,
    token: gUSD,
    amount: borrowAmount,
    collateralToken: gETH,
    collateralAmount: lowCollateral,
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

  const res = await fetch(`${SERVER}/api/v1/borrow-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...borrowMsg, auth }),
  });
  const data = await res.json() as any;

  if (res.ok) {
    console.error("FAIL: borrow intent accepted with insufficient collateral");
    process.exit(1);
  }

  console.log(`  Rejected:     ${data.error}`);
  console.log(`  Tier:         ${data.tier}`);
  console.log(`  ETH price:    $${data.ethPrice?.toFixed(2)}`);
  console.log(`  Required USD: $${data.requiredUsd?.toFixed(2)}`);
  console.log(`  Provided USD: $${data.providedUsd?.toFixed(2)}`);

  if (!data.error.includes("Insufficient collateral")) {
    console.error(`FAIL: unexpected error: ${data.error}`);
    process.exit(1);
  }

  // ── Test 2: Should ACCEPT with sufficient collateral ──
  // Compute: need (borrowUSD * multiplier) / ethPrice worth of ETH, add 10% buffer
  const requiredEth = (100 * score.collateralMultiplier) / score.ethPrice;
  const safeEth = requiredEth * 1.1; // 10% buffer
  const highCollateral = ethers.parseEther(safeEth.toFixed(6)).toString();
  console.log(`\nTest 2: Submit with sufficient collateral (${safeEth.toFixed(4)} gETH ≈ $${(safeEth * score.ethPrice).toFixed(2)})...`);

  const timestamp2 = ts();
  const borrowMsg2 = {
    account: borrower.address,
    token: gUSD,
    amount: borrowAmount,
    collateralToken: gETH,
    collateralAmount: highCollateral,
    encryptedMaxRate: encrypted,
    timestamp: timestamp2,
  };
  const auth2 = await borrower.signTypedData(GHOST_DOMAIN, {
    "Submit Borrow": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "collateralToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "encryptedMaxRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  }, borrowMsg2);

  const result2 = await post("/api/v1/borrow-intent", { ...borrowMsg2, auth: auth2 });
  console.log(`  Accepted: intentId = ${result2.intentId}`);

  console.log("\nPASS: price-based collateral check enforces tier multiplier correctly");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
