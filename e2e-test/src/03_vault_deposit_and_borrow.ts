/**
 * Step 3: Borrower deposits collateral + submits borrow intent
 * - Deposits 5 nETH into vault
 * - Private transfers 5 nETH to pool wallet as collateral
 * - Submits borrow intent: 800 nUSD, max 10% rate
 */
import { ethers } from "ethers";
import { borrower, pool } from "./utils";
import {
  nUSD, nETH, VAULT_ADDRESS, ERC20_ABI, VAULT_ABI,
  toWei, ts, encryptRate, privateTransfer,
  post, get, NOCTRUM_DOMAIN, getVaultBalances, waitForVaultBalance,
} from "./utils";

async function main() {
  console.log("=== Step 3: Vault Deposit & Borrow ===\n");

  // Approve + deposit nETH on-chain
  console.log("Borrower: approve + deposit 5 nETH into vault...");
  const token = new ethers.Contract(nETH, ERC20_ABI, borrower);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  const before = BigInt((await getVaultBalances(borrower)).nETH);
  await (await token.approve(VAULT_ADDRESS, toWei(5))).wait();
  await (await vault.deposit(nETH, toWei(5))).wait();
  await waitForVaultBalance(borrower, nETH, before + BigInt(toWei(5)));

  // Private transfer collateral to pool
  console.log("Borrower: private transfer 5 nETH -> pool...");
  await privateTransfer(borrower, pool.address, nETH, toWei(5));

  // Submit borrow intent
  console.log("Borrower: submitting borrow intent (800 nUSD, 5 nETH collateral, max 10%)...");
  const encrypted = encryptRate("0.10");
  const timestamp = ts();
  const borrowMsg = {
    account: borrower.address,
    token: nUSD,
    amount: toWei(800),
    collateralToken: nETH,
    collateralAmount: toWei(5),
    encryptedMaxRate: encrypted,
    timestamp,
  };
  const auth = await borrower.signTypedData(NOCTRUM_DOMAIN, {
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
  const result = await post("/api/v1/borrow-intent", { ...borrowMsg, auth });
  console.log(`Borrow intent created - intentId: ${result.intentId}`);

  // Print vault balances
  console.log("\n--- Private vault balances ---");
  for (const { label, w } of [{ label: "Borrower", w: borrower }, { label: "Pool", w: pool }]) {
    const bal = await getVaultBalances(w);
    console.log(`  ${label.padEnd(10)} nUSD: ${ethers.formatEther(bal.nUSD).padStart(10)}  nETH: ${ethers.formatEther(bal.nETH).padStart(10)}`);
  }

  // Print pending intents
  console.log("\n--- Pending intents ---");
  const intents = await get("/api/v1/internal/pending-intents");
  console.log(`  Lend intents:   ${intents.lendIntents.length}`);
  console.log(`  Borrow intents: ${intents.borrowIntents.length}`);
  for (const bi of intents.borrowIntents) {
    console.log(`    ${bi.intentId.slice(0, 8)}... | ${ethers.formatEther(bi.amount)} nUSD | collateral: ${ethers.formatEther(bi.collateralAmount)} nETH`);
  }

  console.log("\nDone! Now run CRE workflows:");
  console.log("  cd noctrum-settler   # local stack: use --target=local-settings");
  console.log("  cre workflow simulate ./settle-loans --target=staging-settings --non-interactive --trigger-index=0");
  console.log("  sleep 6");
  console.log("  cre workflow simulate ./settle-loans --target=staging-settings --non-interactive --trigger-index=0");
  console.log("  cre workflow simulate ./execute-transfers --target=staging-settings --non-interactive --trigger-index=0");
  console.log("  cre workflow simulate ./check-loans --target=staging-settings --non-interactive --trigger-index=0");
  console.log("Then run step 04.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
