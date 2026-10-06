import { ethers } from "ethers";
import { config } from "./config";

const EXTERNAL_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: config.CHAIN_ID,
  verifyingContract: config.EXTERNAL_VAULT_ADDRESS as `0x${string}`,
};

const poolWallet = config.POOL_PRIVATE_KEY
  ? new ethers.Wallet(config.POOL_PRIVATE_KEY)
  : null;

export function getPoolAddress(): string {
  return poolWallet?.address ?? "0x0000000000000000000000000000000000000000";
}

export function currentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

async function signAndPost(
  wallet: ethers.Wallet,
  types: Record<string, ethers.TypedDataField[]>,
  message: Record<string, unknown>,
  endpoint: string,
  body: Record<string, unknown>
): Promise<any> {
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, types, message);
  const url = `${config.EXTERNAL_API_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, auth }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `External API ${endpoint} failed: ${JSON.stringify(data)}`
    );
  return data;
}

export async function requestWithdrawTicket(
  wallet: ethers.Wallet = poolWallet!,
  token: string,
  amount: string
): Promise<any> {
  if (!wallet) throw new Error("POOL_PRIVATE_KEY required for requestWithdrawTicket");
  const account = wallet.address;
  const timestamp = currentTimestamp();
  const message = { account, token, amount, timestamp };
  const types = {
    "Withdraw Tokens": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  return signAndPost(wallet, types, message, "/withdraw", {
    account,
    token,
    amount,
    timestamp,
  });
}

export async function privateTransfer(
  wallet: ethers.Wallet = poolWallet!,
  recipient: string,
  token: string,
  amount: string
): Promise<any> {
  if (!wallet) throw new Error("POOL_PRIVATE_KEY required for privateTransfer");
  const sender = wallet.address;
  const timestamp = currentTimestamp();
  const message = {
    sender,
    recipient,
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
  return signAndPost(wallet, types, message, "/private-transfer", {
    account: sender,
    recipient,
    token,
    amount,
    flags: [],
    timestamp,
  });
}

export async function getBalance(
  wallet: ethers.Wallet = poolWallet!,
  token: string
): Promise<{ balances: Record<string, string> }> {
  if (!wallet) throw new Error("POOL_PRIVATE_KEY required for getBalance");
  const account = wallet.address;
  const timestamp = currentTimestamp();
  const message = { account, timestamp };
  const types = {
    "Retrieve Balances": [
      { name: "account", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  return signAndPost(wallet, types, message, "/balances", {
    account,
    timestamp,
  });
}
