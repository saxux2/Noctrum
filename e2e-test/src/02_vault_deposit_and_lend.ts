/**
 * Step 2: Lenders deposit into vault + create lend intents
 * - Lender A: 500 nUSD @ 5%
 * - Lender B: 500 nUSD @ 8%
 */
import { ethers } from "ethers";
import { lenderA, lenderB, pool } from "./utils";
import {
  nUSD, VAULT_ADDRESS, ERC20_ABI, VAULT_ABI,
  toWei, ts, encryptRate, privateTransfer,
  post, get, NOCTRUM_DOMAIN, getVaultBalances,
} from "./utils";

async function lendFlow(wallet: ethers.Wallet, amount: string, rate: string, label: string) {
  // Approve + deposit on-chain
  console.log(`  [${label}] Approve + deposit ${ethers.formatEther(amount)} nUSD into vault...`);
  const token = new ethers.Contract(nUSD, ERC20_ABI, wallet);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  await (await token.approve(VAULT_ADDRESS, amount)).wait();
  await (await vault.deposit(nUSD, amount)).wait();

  // Init deposit-lend on Noctrum server
  console.log(`  [${label}] Init deposit-lend...`);
  const init = await post("/api/v1/deposit-lend/init", {
    account: wallet.address,
    token: nUSD,
    amount,
  });
  console.log(`  [${label}] SlotId: ${init.slotId}`);

  // Private transfer to pool wallet
  console.log(`  [${label}] Private transfer -> pool wallet...`);
  await privateTransfer(wallet, pool.address, nUSD, amount);

  // Confirm with encrypted rate
  const encrypted = encryptRate(rate);
  const timestamp = ts();
  const confirmMsg = { account: wallet.address, slotId: init.slotId, encryptedRate: encrypted, timestamp };
  const auth = await wallet.signTypedData(NOCTRUM_DOMAIN, {
    "Confirm Deposit": [
      { name: "account", type: "address" },
      { name: "slotId", type: "string" },
      { name: "encryptedRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  }, confirmMsg);
  const confirm = await post("/api/v1/deposit-lend/confirm", { ...confirmMsg, auth });
  console.log(`  [${label}] Confirmed - intentId: ${confirm.intentId}`);
}

async function main() {
  console.log("=== Step 2: Vault Deposit & Lend ===\n");

  console.log("--- Lender A: 500 nUSD @ 5% ---");
  await lendFlow(lenderA, toWei(500), "0.05", "A");

  console.log("\n--- Lender B: 500 nUSD @ 8% ---");
  await lendFlow(lenderB, toWei(500), "0.08", "B");

  // Print vault balances
  console.log("\n--- Private vault balances ---");
  for (const { label, w } of [{ label: "Lender A", w: lenderA }, { label: "Lender B", w: lenderB }]) {
    const bal = await getVaultBalances(w);
    console.log(`  ${label.padEnd(10)} nUSD: ${ethers.formatEther(bal.nUSD).padStart(10)}`);
  }

  // Print pending intents
  console.log("\n--- Pending lend intents ---");
  const intents = await get("/api/v1/internal/pending-intents");
  for (const li of intents.lendIntents) {
    console.log(`  ${li.intentId.slice(0, 8)}... | ${ethers.formatEther(li.amount)} nUSD`);
  }

  console.log(`\nTotal lend intents: ${intents.lendIntents.length}`);
  console.log("Done! Run step 03 next.");
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
