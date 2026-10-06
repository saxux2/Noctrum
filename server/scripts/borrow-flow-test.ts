/**
 * Integration test: 2 lends + 1 borrow flow
 *
 * Prereqs: bun run dev, CRE_PUBLIC_KEY, PRIVATE_KEY, POOL_PRIVATE_KEY in env
 * Usage:   bun run scripts/borrow-flow-test.ts
 */
import { ethers } from "ethers";
import { encrypt } from "eciesjs";

// ── Config ──────────────────────────────────────────
const SERVER = "http://localhost:3000";
const EXTERNAL_API = process.env.EXTERNAL_API_URL ?? "http://localhost:8081";
const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
const VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const CHAIN_ID = 10143;

const DEPLOYER_KEY =
  process.env.PRIVATE_KEY!;
const POOL_KEY =
  process.env.POOL_PRIVATE_KEY!;
const CRE_PUBKEY =
  process.env.CRE_PUBLIC_KEY!;

const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
const poolWallet = new ethers.Wallet(POOL_KEY, provider);

// Generate fresh wallets for lender1, lender2, borrower
const lender1 = new ethers.Wallet(
  ethers.Wallet.createRandom().privateKey,
  provider,
);
const lender2 = new ethers.Wallet(
  ethers.Wallet.createRandom().privateKey,
  provider,
);
const borrower = new ethers.Wallet(
  ethers.Wallet.createRandom().privateKey,
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
  "function transfer(address to, uint256 amount) returns (bool)",
];
const VAULT_ABI = ["function deposit(address token, uint256 amount)"];

// ── Helpers ─────────────────────────────────────────
function ts() {
  return Math.floor(Date.now() / 1000);
}

function toWei(n: number): string {
  return ethers.parseEther(n.toString()).toString();
}

function encryptRate(rate: string): string {
  const buf = encrypt(CRE_PUBKEY, Buffer.from(rate));
  return "0x" + Buffer.from(buf).toString("hex");
}

async function privateTransfer(
  from: ethers.Wallet,
  to: string,
  token: string,
  amount: string,
) {
  const timestamp = ts();
  const message = {
    sender: from.address,
    recipient: to,
    token,
    amount,
    flags: [] as string[],
    timestamp,
  };
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
    body: JSON.stringify({
      account: from.address,
      recipient: to,
      token,
      amount,
      flags: [],
      timestamp,
      auth,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Transfer failed: ${JSON.stringify(data)}`);
  return data;
}

async function getVaultBalances(
  wallet: ethers.Wallet,
): Promise<{ nUSD: string; nETH: string }> {
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
  const findBal = (tok: string) =>
    balances.find((b: any) => b.token.toLowerCase() === tok.toLowerCase())
      ?.amount ?? "0";
  return { nUSD: findBal(nUSD), nETH: findBal(nETH) };
}

async function postServer(path: string, body: any) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!res.ok)
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function getServer(path: string) {
  const res = await fetch(`${SERVER}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  return res.json() as any;
}

// ── Lend flow helper ────────────────────────────────
async function lendFlow(
  wallet: ethers.Wallet,
  token: string,
  amount: string,
  rate: string,
  label: string,
) {
  console.log(`\n  [${label}] Init deposit-lend...`);
  const init = await postServer("/api/v1/deposit-lend/init", {
    account: wallet.address,
    token,
    amount,
  });
  const slotId = init.slotId;
  console.log(`  [${label}] SlotId: ${slotId}`);

  console.log(
    `  [${label}] Private transfer ${ethers.formatEther(amount)} nUSD → pool...`,
  );
  await privateTransfer(wallet, poolWallet.address, token, amount);

  const encryptedRate = encryptRate(rate);
  console.log(
    `  [${label}] Encrypted rate (${rate}): ${encryptedRate.slice(0, 20)}...`,
  );

  const timestamp = ts();
  const confirmMsg = {
    account: wallet.address,
    slotId,
    encryptedRate,
    timestamp,
  };
  const confirmTypes = {
    "Confirm Deposit": [
      { name: "account", type: "address" },
      { name: "slotId", type: "string" },
      { name: "encryptedRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const auth = await wallet.signTypedData(
    NOCTRUM_DOMAIN,
    confirmTypes,
    confirmMsg,
  );
  const confirm = await postServer("/api/v1/deposit-lend/confirm", {
    ...confirmMsg,
    auth,
  });
  console.log(`  [${label}] Confirmed — intentId: ${confirm.intentId}`);
  return confirm;
}

// ── Main ────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   NOCTRUM: 2 Lends + 1 Borrow Integration      ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Pool:      ${poolWallet.address}`);
  console.log(`  Lender1:   ${lender1.address}`);
  console.log(`  Lender2:   ${lender2.address}`);
  console.log(`  Borrower:  ${borrower.address}`);

  // ══════════════════════════════════════════════════
  // STEP 1: Setup — deposit on-chain + distribute via private transfers
  // ══════════════════════════════════════════════════
  console.log(
    "\n=== STEP 1: Setup — ERC20 distribute + each wallet deposits to vault ===",
  );

  const nUSDContract = new ethers.Contract(nUSD, ERC20_ABI, deployer);
  const nETHContract = new ethers.Contract(nETH, ERC20_ABI, deployer);

  // ERC20 transfers from deployer
  console.log("  ERC20-transferring tokens...");
  const t1 = await nUSDContract.transfer(lender1.address, toWei(10));
  const t2 = await nUSDContract.transfer(lender2.address, toWei(15));
  const t3 = await nETHContract.transfer(borrower.address, toWei(5));
  await Promise.all([t1.wait(), t2.wait(), t3.wait()]);
  console.log("    Lender1: 10 nUSD | Lender2: 15 nUSD | Borrower: 5 nETH");

  // Send gas ETH to all fresh wallets
  console.log("  Sending gas ETH...");
  const g1 = await deployer.sendTransaction({
    to: lender1.address,
    value: ethers.parseEther("0.005"),
  });
  const g2 = await deployer.sendTransaction({
    to: lender2.address,
    value: ethers.parseEther("0.005"),
  });
  const g3 = await deployer.sendTransaction({
    to: borrower.address,
    value: ethers.parseEther("0.005"),
  });
  await Promise.all([g1.wait(), g2.wait(), g3.wait()]);

  // Each wallet approves + deposits into vault
  console.log("  Lender1 approve + deposit 10 nUSD...");
  const l1Token = new ethers.Contract(nUSD, ERC20_ABI, lender1);
  const l1Vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, lender1);
  await (await l1Token.approve(VAULT_ADDRESS, toWei(10))).wait();
  await (await l1Vault.deposit(nUSD, toWei(10))).wait();

  console.log("  Lender2 approve + deposit 15 nUSD...");
  const l2Token = new ethers.Contract(nUSD, ERC20_ABI, lender2);
  const l2Vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, lender2);
  await (await l2Token.approve(VAULT_ADDRESS, toWei(15))).wait();
  await (await l2Vault.deposit(nUSD, toWei(15))).wait();

  console.log("  Borrower approve + deposit 5 nETH...");
  const bToken = new ethers.Contract(nETH, ERC20_ABI, borrower);
  const bVault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, borrower);
  await (await bToken.approve(VAULT_ADDRESS, toWei(5))).wait();
  await (await bVault.deposit(nETH, toWei(5))).wait();

  console.log("  Setup complete!");

  // ══════════════════════════════════════════════════
  // STEP 2: Lender1 lend (10 nUSD @ 5%)
  // ══════════════════════════════════════════════════
  console.log("\n=== STEP 2: Lender1 — 10 nUSD @ 5% ===");
  await lendFlow(lender1, nUSD, toWei(10), "0.05", "Lender1");

  // ══════════════════════════════════════════════════
  // STEP 3: Lender2 lend (15 nUSD @ 8%)
  // ══════════════════════════════════════════════════
  console.log("\n=== STEP 3: Lender2 — 15 nUSD @ 8% ===");
  await lendFlow(lender2, nUSD, toWei(15), "0.08", "Lender2");

  // ══════════════════════════════════════════════════
  // STEP 4: Borrower — borrow 20 nUSD w/ 5 nETH collateral, max 10%
  // ══════════════════════════════════════════════════
  console.log(
    "\n=== STEP 4: Borrower — 20 nUSD, 5 nETH collateral, max 10% ===",
  );

  // Transfer collateral to pool
  console.log("  Borrower private-transfers 5 nETH → pool...");
  await privateTransfer(borrower, poolWallet.address, nETH, toWei(5));

  const encryptedMaxRate = encryptRate("0.10");
  console.log(
    `  Encrypted maxRate (0.10): ${encryptedMaxRate.slice(0, 20)}...`,
  );

  const borrowTs = ts();
  const borrowMsg = {
    account: borrower.address,
    token: nUSD,
    amount: toWei(20),
    collateralToken: nETH,
    collateralAmount: toWei(5),
    encryptedMaxRate,
    timestamp: borrowTs,
  };
  const borrowTypes = {
    "Submit Borrow": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "collateralToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "encryptedMaxRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const borrowAuth = await borrower.signTypedData(
    NOCTRUM_DOMAIN,
    borrowTypes,
    borrowMsg,
  );
  const borrowResult = await postServer("/api/v1/borrow-intent", {
    ...borrowMsg,
    auth: borrowAuth,
  });
  console.log(`  Borrow intent created — intentId: ${borrowResult.intentId}`);

  // ══════════════════════════════════════════════════
  // STEP 5: Print vault balances
  // ══════════════════════════════════════════════════
  console.log("\n=== STEP 5: Vault Balances ===");
  const wallets = [
    { label: "Lender1", w: lender1 },
    { label: "Lender2", w: lender2 },
    { label: "Borrower", w: borrower },
    { label: "Pool", w: poolWallet },
    { label: "Deployer", w: deployer },
  ];
  for (const { label, w } of wallets) {
    const bal = await getVaultBalances(w);
    console.log(
      `  ${label.padEnd(10)} nUSD: ${ethers.formatEther(bal.nUSD).padStart(10)}  nETH: ${ethers.formatEther(bal.nETH).padStart(10)}`,
    );
  }

  // ══════════════════════════════════════════════════
  // STEP 6: Print pending intents
  // ══════════════════════════════════════════════════
  console.log("\n=== STEP 6: Pending Intents ===");
  const intents = await getServer("/api/v1/internal/pending-intents");

  console.log(`  Lend intents (${intents.lendIntents.length}):`);
  for (const li of intents.lendIntents) {
    console.log(
      `    ${li.intentId.slice(0, 8)}... | ${ethers.formatEther(li.amount)} ${li.token === nUSD.toLowerCase() ? "nUSD" : li.token} | rate: ${li.encryptedRate.slice(0, 20)}...`,
    );
  }

  console.log(`  Borrow intents (${intents.borrowIntents.length}):`);
  for (const bi of intents.borrowIntents) {
    console.log(
      `    ${bi.intentId.slice(0, 8)}... | ${ethers.formatEther(bi.amount)} nUSD | collateral: ${ethers.formatEther(bi.collateralAmount)} nETH | maxRate: ${bi.encryptedMaxRate.slice(0, 20)}...`,
    );
  }

  // ── Verification ──────────────────────────────────
  console.log("\n=== VERIFICATION ===");
  const ok =
    intents.lendIntents.length === 2 && intents.borrowIntents.length === 1;
  console.log(
    `  2 lend intents: ${intents.lendIntents.length === 2 ? "✓" : "✗"}`,
  );
  console.log(
    `  1 borrow intent: ${intents.borrowIntents.length === 1 ? "✓" : "✗"}`,
  );
  console.log(`  Result: ${ok ? "PASS" : "FAIL"}`);

  console.log("\n=== DONE ===\n");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
