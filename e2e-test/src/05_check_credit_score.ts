/**
 * Step 5: Check credit score for borrower
 * - Verify new user starts at bronze tier
 * - Verify collateral multiplier = 2.0
 */
import { borrower } from "./utils";
import { get } from "./utils";

async function main() {
  console.log("=== Step 5: Check Credit Score ===\n");

  const addr = borrower.address;
  console.log(`Checking credit score for ${addr}...`);
  const score = await get(`/api/v1/credit-score/${addr}`);

  console.log(`  Tier:                 ${score.tier}`);
  console.log(`  Loans repaid:         ${score.loansRepaid}`);
  console.log(`  Loans defaulted:      ${score.loansDefaulted}`);
  console.log(`  Collateral multiplier: ${score.collateralMultiplier}x`);

  if (score.tier !== "bronze") {
    console.error(`FAIL: expected bronze, got ${score.tier}`);
    process.exit(1);
  }
  if (score.collateralMultiplier !== 2) {
    console.error(`FAIL: expected multiplier 2, got ${score.collateralMultiplier}`);
    process.exit(1);
  }

  console.log("\nPASS: borrower starts at bronze tier with 2.0x multiplier");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
