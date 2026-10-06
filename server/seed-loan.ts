/**
 * Seeds the Noctrum server with a lend + borrow + loan via the real API flow.
 * Uses the POOL_PRIVATE_KEY wallet for both lender and borrower (test only).
 */
import { ethers } from "ethers";

const BASE = "http://localhost:3000/api/v1";
const PRIVATE_KEY = process.env.POOL_PRIVATE_KEY!;
const nUSD = "0x339a948f3667d222FAD43d313b3b8c3BE1415ad5";
const nETH = "0x39AD31E31b8b202E6Fa7BD8682E68aC4e66cE92A";

const wallet = new ethers.Wallet(PRIVATE_KEY);
const account = wallet.address;

const EIP712_DOMAIN = {
  name: "NoctrumProtocol",
  version: "0.0.1",
  chainId: 10143,
  verifyingContract: "0x65877F6BFd3f2D293454658BCb290b112397Eeb5",
};

function ts(): number {
  return Math.floor(Date.now() / 1000);
}

async function post(path: string, body: any) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function sign(primaryType: string, types: any, message: any) {
  return wallet.signTypedData(EIP712_DOMAIN, { [primaryType]: types }, message);
}

async function main() {
  console.log("Account:", account);

  // 1. Init deposit-lend (1000 nUSD)
  console.log("\n1. Init deposit-lend...");
  const initRes = await post("/deposit-lend/init", {
    account,
    token: nUSD,
    amount: "1000000000000000000000",
  });
  console.log("  slotId:", initRes.slotId);

  // 2. Confirm deposit-lend
  console.log("2. Confirm deposit-lend...");
  const t1 = ts();
  const confirmMsg = { account, slotId: initRes.slotId, encryptedRate: "encrypted_5pct", timestamp: t1 };
  const confirmAuth = await sign("Confirm Deposit", [
    { name: "account", type: "address" },
    { name: "slotId", type: "string" },
    { name: "encryptedRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ], confirmMsg);
  const confirmRes = await post("/deposit-lend/confirm", { ...confirmMsg, auth: confirmAuth });
  console.log("  intentId:", confirmRes.intentId);

  // 3. Submit borrow intent (borrow 1000 nUSD, collateral 0.5 nETH)
  console.log("3. Submit borrow intent...");
  const t2 = ts();
  const borrowMsg = {
    account, token: nUSD,
    amount: "1000000000000000000000",
    collateralToken: nETH,
    collateralAmount: "500000000000000000", // 0.5 nETH
    encryptedMaxRate: "encrypted_10pct",
    timestamp: t2,
  };
  const borrowAuth = await sign("Submit Borrow", [
    { name: "account", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "collateralToken", type: "address" },
    { name: "collateralAmount", type: "uint256" },
    { name: "encryptedMaxRate", type: "string" },
    { name: "timestamp", type: "uint256" },
  ], borrowMsg);
  const borrowRes = await post("/borrow-intent", { ...borrowMsg, auth: borrowAuth });
  console.log("  intentId:", borrowRes.intentId);

  // 4. Record match proposal (internal, pass explicit proposalId)
  const proposalId = "test-proposal-1";
  console.log("4. Record match proposal...");
  await post("/internal/record-match-proposals", {
    proposals: [{
      proposalId,
      borrowIntentId: borrowRes.intentId,
      borrower: account,
      token: nUSD,
      principal: "1000000000000000000000",
      matchedTicks: [{
        lender: account,
        lendIntentId: confirmRes.intentId,
        amount: "1000000000000000000000",
        rate: 0.05,
      }],
      effectiveBorrowerRate: 0.05,
      collateralToken: nETH,
      collateralAmount: "500000000000000000",
    }],
  });
  console.log("  recorded");

  // 5. Accept proposal (creates the loan)
  console.log("5. Accept proposal...");
  const t3 = ts();
  const acceptMsg = { account, proposalId, timestamp: t3 };
  const acceptAuth = await sign("Accept Proposal", [
    { name: "account", type: "address" },
    { name: "proposalId", type: "string" },
    { name: "timestamp", type: "uint256" },
  ], acceptMsg);
  const acceptRes = await post("/accept-proposal", { ...acceptMsg, auth: acceptAuth });
  console.log("  loanId:", acceptRes.loanId);

  // 6. Verify loan exists
  console.log("\n6. Check loans:");
  const loansRes = await post("/internal/check-loans", {});
  console.log(JSON.stringify(loansRes, null, 2));
}

main().catch(console.error);
