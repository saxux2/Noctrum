/**
 * Full end-to-end test: deposit ERC20 → vault → private transfer → NOCTRUM confirm → cancel → redeem on-chain
 *
 * Prereqs: server running (bun run dev), user wallet has 10+ nUSD ERC20 + MON, pool has MON
 * Usage:   bun run scripts/real-flow-test.ts
 */
import { ethers } from "ethers";
import { execSync } from "child_process";

const SERVER = "http://localhost:3000";
const EXTERNAL_API = process.env.EXTERNAL_API_URL ?? "http://localhost:8081";
const RPC_URL = process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz";
const VAULT_ADDRESS = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const CHAIN_ID = 10143;

const USER_KEY = process.env.PRIVATE_KEY!;
const POOL_KEY = process.env.POOL_PRIVATE_KEY!;
const TOKEN = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
const AMOUNT = "10000000000000000000"; // 10 nUSD

const provider = new ethers.JsonRpcProvider(RPC_URL);
const userWallet = new ethers.Wallet(USER_KEY, provider);
const poolWallet = new ethers.Wallet(POOL_KEY, provider);

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

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdrawWithTicket(address token, uint256 amount, bytes ticket)",
];

function ts() {
  return Math.floor(Date.now() / 1000);
}

async function getVaultBalance(wallet: ethers.Wallet): Promise<string> {
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
  // API returns array: [{token, amount}]
  const entry = data.balances?.find(
    (b: any) => b.token.toLowerCase() === TOKEN.toLowerCase()
  );
  return entry?.amount ?? "0";
}

async function privateTransfer(
  from: ethers.Wallet,
  to: string,
  amount: string
) {
  const timestamp = ts();
  const message = {
    sender: from.address,
    recipient: to,
    token: TOKEN,
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
      token: TOKEN,
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

async function postServer(path: string, body: any) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  return { status: res.status, data };
}

async function main() {
  const token = new ethers.Contract(TOKEN, ERC20_ABI, userWallet);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, userWallet);

  console.log(`\n  User wallet:  ${userWallet.address}`);
  console.log(`  Pool wallet:  ${poolWallet.address}`);
  console.log(`  Token:        ${TOKEN}`);
  console.log(`  Amount:       10 nUSD\n`);

  // ──────────────────────────────────────────────
  // STEP 1: Check initial balances
  // ──────────────────────────────────────────────
  console.log("=== STEP 1: Initial balances ===");
  const erc20Bal = await token.balanceOf(userWallet.address);
  const userVault0 = await getVaultBalance(userWallet);
  const poolVault0 = await getVaultBalance(poolWallet);
  console.log(`  User ERC20:        ${ethers.formatEther(erc20Bal)} nUSD`);
  console.log(`  User vault (priv): ${ethers.formatEther(userVault0)} nUSD`);
  console.log(`  Pool vault (priv): ${ethers.formatEther(poolVault0)} nUSD`);

  if (erc20Bal < BigInt(AMOUNT)) {
    console.error("\n  ERROR: User needs at least 10 nUSD ERC20 balance");
    process.exit(1);
  }

  // ──────────────────────────────────────────────
  // STEP 2: Approve + Deposit 10 nUSD into vault
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 2: Approve + Deposit 10 nUSD to vault ===");
  const approveTx = await token.approve(VAULT_ADDRESS, AMOUNT);
  console.log(`  Approve tx: ${approveTx.hash}`);
  await approveTx.wait();

  const depositTx = await vault.deposit(TOKEN, AMOUNT);
  console.log(`  Deposit tx: ${depositTx.hash}`);
  await depositTx.wait();

  const erc20After = await token.balanceOf(userWallet.address);
  const userVault1 = await getVaultBalance(userWallet);
  console.log(
    `  User ERC20:        ${ethers.formatEther(erc20After)} nUSD (was ${ethers.formatEther(erc20Bal)})`
  );
  console.log(
    `  User vault (priv): ${ethers.formatEther(userVault1)} nUSD (was ${ethers.formatEther(userVault0)})`
  );

  // ──────────────────────────────────────────────
  // STEP 3: Init deposit-lend on NOCTRUM server
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 3: Init deposit-lend ===");
  const initTs = ts();
  const initMsg = {
    account: userWallet.address,
    token: TOKEN,
    amount: AMOUNT,
    timestamp: initTs,
  };
  const initTypes = {
    "Init Deposit": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const initAuth = await userWallet.signTypedData(
    NOCTRUM_DOMAIN,
    initTypes,
    initMsg
  );
  const init = await postServer("/api/v1/deposit-lend/init", {
    ...initMsg,
    auth: initAuth,
  });
  if (init.status !== 200) {
    console.error("  INIT FAILED:", init.data);
    process.exit(1);
  }
  const slotId = init.data.slotId;
  console.log(`  Slot ID: ${slotId}`);

  // ──────────────────────────────────────────────
  // STEP 4: Private transfer to shielded address
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 4: Private transfer 10 nUSD → pool wallet ===");
  const txResult = await privateTransfer(userWallet, poolWallet.address, AMOUNT);
  console.log(`  Transfer ID: ${txResult.transaction_id}`);
  const userVault2 = await getVaultBalance(userWallet);
  const poolVault2 = await getVaultBalance(poolWallet);
  console.log(
    `  User vault (priv): ${ethers.formatEther(userVault2)} nUSD (was ${ethers.formatEther(userVault1)})`
  );
  console.log(
    `  Pool vault (priv): ${ethers.formatEther(poolVault2)} nUSD (was ${ethers.formatEther(poolVault0)})`
  );

  // ──────────────────────────────────────────────
  // STEP 5: Confirm deposit + sealed bid
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 5: Confirm deposit (sealed bid) ===");
  const encryptedRate = "0xfake_encrypted_rate_500bps";
  const confirmTs = ts();
  const confirmMsg = {
    account: userWallet.address,
    slotId,
    encryptedRate,
    timestamp: confirmTs,
  };
  const confirmTypes = {
    "Confirm Deposit": [
      { name: "account", type: "address" },
      { name: "slotId", type: "string" },
      { name: "encryptedRate", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const confirmAuth = await userWallet.signTypedData(
    NOCTRUM_DOMAIN,
    confirmTypes,
    confirmMsg
  );
  const confirm = await postServer("/api/v1/deposit-lend/confirm", {
    ...confirmMsg,
    auth: confirmAuth,
  });
  console.log(`  Status: ${confirm.status} — ${confirm.data.status}`);
  console.log(`  Intent ID: ${confirm.data.intentId}`);

  // ──────────────────────────────────────────────
  // STEP 6: Cancel lend → get withdraw ticket
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 6: Cancel lend ===");
  const cancelTs = ts();
  const cancelMsg = {
    account: userWallet.address,
    slotId,
    timestamp: cancelTs,
  };
  const cancelTypes = {
    "Cancel Lend": [
      { name: "account", type: "address" },
      { name: "slotId", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const cancelAuth = await userWallet.signTypedData(
    NOCTRUM_DOMAIN,
    cancelTypes,
    cancelMsg
  );
  const cancel = await postServer("/api/v1/cancel-lend", {
    ...cancelMsg,
    auth: cancelAuth,
  });
  if (cancel.status !== 200) {
    console.error("  CANCEL FAILED:", cancel.data);
    process.exit(1);
  }
  console.log(`  Status: ${cancel.data.status}`);
  const ticketData = cancel.data.ticket;
  console.log(`  Ticket ID: ${ticketData.id}`);
  console.log(`  Ticket hex: ${ticketData.ticket}`);

  // ──────────────────────────────────────────────
  // STEP 7: Redeem ticket on-chain (pool → ERC20)
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 7: Redeem withdraw ticket on-chain ===");
  const vaultPool = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, poolWallet);
  const redeemTx = await vaultPool.withdrawWithTicket(
    TOKEN,
    AMOUNT,
    ticketData.ticket
  );
  console.log(`  Redeem tx: ${redeemTx.hash}`);
  await redeemTx.wait();
  console.log(`  Redeemed!`);

  // ──────────────────────────────────────────────
  // STEP 8: Transfer ERC20 back to user
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 8: Transfer 10 nUSD ERC20 back to user ===");
  const tokenPool = new ethers.Contract(TOKEN, ERC20_ABI, poolWallet);
  const returnTx = await tokenPool.approve(userWallet.address, AMOUNT); // not needed for transfer, but just in case
  await returnTx.wait();
  const transferTx = await new ethers.Contract(
    TOKEN,
    ["function transfer(address to, uint256 amount) returns (bool)"],
    poolWallet
  ).transfer(userWallet.address, AMOUNT);
  console.log(`  Transfer tx: ${transferTx.hash}`);
  await transferTx.wait();

  // ──────────────────────────────────────────────
  // STEP 9: Final balances
  // ──────────────────────────────────────────────
  console.log("\n=== STEP 9: Final balances ===");
  const erc20Final = await token.balanceOf(userWallet.address);
  const userVaultFinal = await getVaultBalance(userWallet);
  const poolVaultFinal = await getVaultBalance(poolWallet);
  console.log(`  User ERC20:        ${ethers.formatEther(erc20Final)} nUSD`);
  console.log(
    `  User vault (priv): ${ethers.formatEther(userVaultFinal)} nUSD`
  );
  console.log(
    `  Pool vault (priv): ${ethers.formatEther(poolVaultFinal)} nUSD`
  );

  console.log("\n=== FULL FLOW COMPLETE ===");
  console.log(
    `  Started with ${ethers.formatEther(erc20Bal)} nUSD ERC20, ended with ${ethers.formatEther(erc20Final)} nUSD ERC20`
  );
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
