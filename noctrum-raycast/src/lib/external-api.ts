import { ethers } from "ethers";
import {
  EXTERNAL_API,
  EXTERNAL_DOMAIN,
  BALANCE_TYPES,
  PRIVATE_TRANSFER_TYPES,
  WITHDRAW_TYPES,
  SHIELDED_ADDRESS_TYPES,
  TRANSACTION_TYPES,
} from "./constants";
import { WalletData } from "./wallet";

const ts = () => Math.floor(Date.now() / 1000);

async function signAndPost(
  wallet: WalletData,
  endpoint: string,
  types: Record<string, ethers.TypedDataField[]>,
  message: Record<string, unknown>,
  extraBody?: Record<string, unknown>
) {
  const signer = new ethers.Wallet(wallet.privateKey);
  const auth = await signer.signTypedData(EXTERNAL_DOMAIN, types, message);
  const body = { ...message, auth, ...extraBody };
  const res = await fetch(`${EXTERNAL_API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || `${endpoint} failed`);
  return data;
}

export async function fetchBalances(wallet: WalletData) {
  const message = { account: wallet.address, timestamp: ts() };
  return signAndPost(wallet, "/balances", BALANCE_TYPES, message);
}

export async function privateTransfer(
  wallet: WalletData,
  recipient: string,
  token: string,
  amount: string
) {
  const message = {
    sender: wallet.address,
    recipient,
    token,
    amount,
    flags: [] as string[],
    timestamp: ts(),
  };
  return signAndPost(wallet, "/private-transfer", PRIVATE_TRANSFER_TYPES, message, {
    account: wallet.address,
  });
}

export async function requestWithdraw(wallet: WalletData, token: string, amount: string) {
  const message = { account: wallet.address, token, amount, timestamp: ts() };
  return signAndPost(wallet, "/withdraw", WITHDRAW_TYPES, message);
}

export async function generateShieldedAddress(wallet: WalletData) {
  const message = { account: wallet.address, timestamp: ts() };
  return signAndPost(wallet, "/shielded-address", SHIELDED_ADDRESS_TYPES, message);
}

export async function fetchTransactions(wallet: WalletData, limit = 20, cursor = "") {
  const message = { account: wallet.address, timestamp: ts(), cursor, limit };
  return signAndPost(wallet, "/transactions", TRANSACTION_TYPES, message);
}
