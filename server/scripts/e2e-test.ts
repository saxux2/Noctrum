/**
 * E2E test: 2 lenders + 1 borrower → on-chain deposit → Noctrum intents
 * Then: settle-loans (CRE) → expire → execute-transfers → check-loans
 *
 * Prereqs:
 *   - Server running: cd server && bun run src/index.ts
 *   - Wallets funded (nUSD to lenders, nETH to borrower, gas ETH to all)
 *
 * Usage: cd server && bun run scripts/e2e-test.ts
 */
import { ethers } from "ethers";
import { encrypt } from "eciesjs";

const SERVER = "http://localhost:3000";
const EXTERNAL_API = process.env.EXTERNAL_API_URL ?? "http://localhost:8081";
const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
const VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const CHAIN_ID = 10143;

const CRE_PUBKEY = process.env.CRE_PUBLIC_KEY!;

const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolWallet = new ethers.Wallet(
  process.env.POOL_PRIVATE_KEY!,
  provider,
);

// Fixed test wallets (from server/.env)
const lenderA = new ethers.Wallet(
  process.env.LENDER_A_KEY!,
  provider,
);
const lenderB = new ethers.Wallet(
  process.env.LENDER_B_KEY!,
  provider,
);
const borrower = new ethers.Wallet(
  process.env.BORROWER_KEY!,
  provider,
);

// ── Domains ─────────────────────────────────────────
const NOCTRUM_DOMAIN = {
  name: "NoctrumProtocol",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

const EXTERNAL_DOMAIN = {
  name: "NoctrumPrivateToken",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

// ── ABIs ────────────────────────────────────────────
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const VAULT_ABI = ["function deposit(address token, uint256 amount)"];

// ── Helpers ─────────────────────────────────────────
const ts = () => Math.floor(Date.now() / 1000);
const toWei = (n: number) => ethers.parseEther(n.toString()).toString();

function encryptRate(rate: string): string {
  const buf = encrypt(CRE_PUBKEY, Buffer.from(rate));
  return "0x" + Buffer.from(buf).toString("hex");
}

async function privateTransfer(from: ethers.Wallet, to: string, token: string, amount: string) {
  const timestamp = ts();
  const message = { sender: from.address, recipient: to, token, amount, flags: [] as string[], timestamp };
  const types = {
    "Private Token Transfer": [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "flags", type: "string[]" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const auth = await from.signTypedData(EXTERNAL_DOMAIN, types, message);
  const res = await fetch(`${EXTERNAL_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: from.address, recipient: to, token, amount, flags: [], timestamp, auth }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Transfer failed: ${JSON.stringify(data)}`);
  return data;
}

async function getVaultBalances(wallet: ethers.Wallet) {
  const timestamp = ts();
  const message = { account: wallet.address, timestamp };
  const types = {
    "Retrieve Balances": [
      { name: "account", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, types, message);
  const res = await fetch(`${EXTERNAL_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: wallet.address, timestamp, auth }),
  });
  const data: any = await res.json();
  const balances = data.balances ?? [];
  const find = (tok: string) =>
    balances.find((b: any) => b.token.toLowerCase() === tok.toLowerCase())?.amount ?? "0";
  return { nUSD: find(nUSD), nETH: find(nETH) };
}

async function post(path: string, body: any) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function get(path: string) {
  return fetch(`${SERVER}${path}`, { headers: { "Content-Type": "application/json" } }).then(r => r.json()) as any;
}

// ── Lend flow ───────────────────────────────────────
async function lendFlow(wallet: ethers.Wallet, token: string, amount: string, rate: string, label: string) {
  console.log(`  [${label}] Init deposit-lend...`);
  const init = await post("/api/v1/deposit-lend/init", { account: wallet.address, token, amount });
  console.log(`  [${label}] SlotId: ${init.slotId}`);

  console.log(`  [${label}] Private transfer ${ethers.formatEther(amount)} nUSD -> pool...`);
  await privateTransfer(wallet, poolWallet.address, token, amount);

  const encryptedRate = encryptRate(rate);
  const timestamp = ts();
  const confirmMsg = { account: wallet.address, slotId: init.slotId, encryptedRate, timestamp };
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
  return confirm;
}

// ── Main ────────────────────────────────────────────
async function main() {
  console.log("=== NOCTRUM E2E: 2 Lenders + 1 Borrower ===");
  console.log(`  Pool:      ${poolWallet.address}`);
  console.log(`  Lender A:  ${lenderA.address}`);
  console.log(`  Lender B:  ${lenderB.address}`);
  console.log(`  Borrower:  ${borrower.address}`);

  // ── STEP 1: On-chain approve + deposit into vault ──
  console.log("\n--- STEP 1: Vault deposits ---");

  console.log("  Lender A: approve + deposit 500 nUSD...");
  const laToken = new ethers.Contract(nUSD, ERC20_ABI, lenderA);
  const laVault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, lenderA);
  await (await laToken.approve(VAULT_ADDRESS, toWei(500))).wait();
  await (await laVault.deposit(nUSD, toWei(500))).wait();

  console.log("  Lender B: approve + deposit 500 nUSD...");
  const lbToken = new ethers.Contract(nUSD, ERC20_ABI, lenderB);
  const lbVault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, lenderB);
  await (await lbToken.approve(VAULT_ADDRESS, toWei(500))).wait();
  await (await lbVault.deposit(nUSD, toWei(500))).wait();

  console.log("  Borrower: approve + deposit 5 nETH...");
  const bToken = new ethers.Contract(nETH, ERC20_ABI, borrower);
  const bVault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  await (await bToken.approve(VAULT_ADDRESS, toWei(5))).wait();
  await (await bVault.deposit(nETH, toWei(5))).wait();

  console.log("  All vault deposits done!");

  // ── STEP 2: Lender A lend (500 nUSD @ 5%) ──
  console.log("\n--- STEP 2: Lender A - 500 nUSD @ 5% ---");
  await lendFlow(lenderA, nUSD, toWei(500), "0.05", "A");

  // ── STEP 3: Lender B lend (500 nUSD @ 8%) ──
  console.log("\n--- STEP 3: Lender B - 500 nUSD @ 8% ---");
  await lendFlow(lenderB, nUSD, toWei(500), "0.08", "B");

  // ── STEP 4: Borrower — borrow 800 nUSD w/ 5 nETH collateral, max 10% ──
  console.log("\n--- STEP 4: Borrower - 800 nUSD, 5 nETH collateral, max 10% ---");

  // Transfer collateral to pool privately
  console.log("  Borrower private-transfers 5 nETH -> pool...");
  await privateTransfer(borrower, poolWallet.address, nETH, toWei(5));

  const encryptedMaxRate = encryptRate("0.10");
  const borrowTs = ts();
  const borrowMsg = {
    account: borrower.address,
    token: nUSD,
    amount: toWei(800),
    collateralToken: nETH,
    collateralAmount: toWei(5),
    encryptedMaxRate,
    timestamp: borrowTs,
  };
  const borrowAuth = await borrower.signTypedData(NOCTRUM_DOMAIN, {
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
  console.log(`  Borrow intent created - intentId: ${borrowResult.intentId}`);

  // ── STEP 5: Print state ──
  console.log("\n--- STEP 5: Vault balances ---");
  for (const { label, w } of [
    { label: "Lender A", w: lenderA },
    { label: "Lender B", w: lenderB },
    { label: "Borrower", w: borrower },
    { label: "Pool", w: poolWallet },
  ]) {
    const bal = await getVaultBalances(w);
    console.log(`  ${label.padEnd(10)} nUSD: ${ethers.formatEther(bal.nUSD).padStart(10)}  nETH: ${ethers.formatEther(bal.nETH).padStart(10)}`);
  }

  console.log("\n--- STEP 6: Pending intents ---");
  const intents = await get("/api/v1/internal/pending-intents");
  console.log(`  Lend intents: ${intents.lendIntents.length}`);
  for (const li of intents.lendIntents) {
    console.log(`    ${li.intentId.slice(0, 8)}... | ${ethers.formatEther(li.amount)} nUSD`);
  }
  console.log(`  Borrow intents: ${intents.borrowIntents.length}`);
  for (const bi of intents.borrowIntents) {
    console.log(`    ${bi.intentId.slice(0, 8)}... | ${ethers.formatEther(bi.amount)} nUSD | collateral: ${ethers.formatEther(bi.collateralAmount)} nETH`);
  }

  console.log("\n=== READY FOR CRE WORKFLOWS ===");
  console.log("  1. cd noctrum-settler && cre workflow simulate ./settle-loans --target=staging-settings");
  console.log("  2. Wait 5s for proposal to expire");
  console.log("  3. cre workflow simulate ./settle-loans --target=staging-settings  (expires + auto-accepts)");
  console.log("  4. cre workflow simulate ./execute-transfers --target=staging-settings  (private transfer)");
  console.log("  5. cre workflow simulate ./check-loans --target=staging-settings  (Chainlink price check)");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
