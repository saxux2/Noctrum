/**
 * E2E test orchestrator
 *
 * Run individual steps:
 *   bun run src/01_transfer-funds.ts
 *   bun run src/02_vault_deposit_and_lend.ts
 *   bun run src/03_vault_deposit_and_borrow.ts
 *   -- run CRE workflows (settle-loans, execute-transfers, check-loans) --
 *   bun run src/04_check_final_loan_and_withdraw.ts
 *   bun run src/05_check_credit_score.ts
 *   bun run src/06_repay_and_check_upgrade.ts
 *   bun run src/07_liquidation_flow.ts
 *   bun run src/08_collateral_tier_check.ts
 */

const step = process.argv[2];

if (!step) {
  console.log("Usage: bun run src/index.ts <step>");
  console.log("");
  console.log("Steps:");
  console.log("  1  Fund wallets (mint gUSD/gETH, send gas ETH)");
  console.log("  2  Lenders: vault deposit + lend intents");
  console.log("  3  Borrower: vault deposit + borrow intent");
  console.log("  -- run CRE workflows (settle, execute, check) --");
  console.log("  4  Check loan + withdraw gUSD to on-chain");
  console.log("  5  Check credit score (borrower = bronze)");
  console.log("  6  Repay loan + verify tier upgrade (bronze -> silver)");
  console.log("  7  Liquidation flow (create loan, liquidate, verify 95/5 split)");
  console.log("  8  Collateral tier check (reject low, accept high)");
  process.exit(0);
}

const scripts: Record<string, string> = {
  "1": "./01_transfer-funds.ts",
  "2": "./02_vault_deposit_and_lend.ts",
  "3": "./03_vault_deposit_and_borrow.ts",
  "4": "./04_check_final_loan_and_withdraw.ts",
  "5": "./05_check_credit_score.ts",
  "6": "./06_repay_and_check_upgrade.ts",
  "7": "./07_liquidation_flow.ts",
  "8": "./08_collateral_tier_check.ts",
};

const script = scripts[step];
if (!script) {
  console.error(`Unknown step: ${step}. Use 1-8.`);
  process.exit(1);
}

await import(script);
