import { ethers } from "ethers";
import { encrypt } from "eciesjs";
import { SERVER, EXTERNAL_API, VAULT_ADDRESS, CHAIN_ID, CRE_PUBKEY, gUSD, gETH } from "./config";

// ── Domains ─────────────────────────────────────────

export const GHOST_DOMAIN = {
  name: "GhostProtocol",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

export const EXTERNAL_DOMAIN = {
  name: "CompliantPrivateTokenDemo",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

// ── ABIs ────────────────────────────────────────────

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdrawWithTicket(address token, uint256 amount, bytes ticket)",
];

export const MINT_ABI = ["function mint(address to, uint256 amount)"];

// ── Helpers ─────────────────────────────────────────

export const ts = () => Math.floor(Date.now() / 1000);
export const toWei = (n: number) => ethers.parseEther(n.toString()).toString();

export function encryptRate(rate: string): string {
  const buf = encrypt(CRE_PUBKEY, Buffer.from(rate));
  return "0x" + Buffer.from(buf).toString("hex");
}

export async function post(path: string, body: any) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

export async function get(path: string) {
  return fetch(`${SERVER}${path}`, { headers: { "Content-Type": "application/json" } }).then(r => r.json()) as any;
}

export async function privateTransfer(from: ethers.Wallet, to: string, token: string, amount: string) {
  const timestamp = ts();
  const message = { sender: from.address, recipient: to, token, amount, flags: [] as string[], timestamp };
  const auth = await from.signTypedData(EXTERNAL_DOMAIN, {
    "Private Token Transfer": [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "flags", type: "string[]" },
      { name: "timestamp", type: "uint256" },
    ],
  }, message);
  const res = await fetch(`${EXTERNAL_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: from.address, recipient: to, token, amount, flags: [], timestamp, auth }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Transfer failed: ${JSON.stringify(data)}`);
  return data;
}

export async function getVaultBalances(wallet: ethers.Wallet) {
  const timestamp = ts();
  const message = { account: wallet.address, timestamp };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, {
    "Retrieve Balances": [
      { name: "account", type: "address" },
      { name: "timestamp", type: "uint256" },
    ],
  }, message);
  const res = await fetch(`${EXTERNAL_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: wallet.address, timestamp, auth }),
  });
  const data: any = await res.json();
  const balances = data.balances ?? [];
  const find = (tok: string) =>
    balances.find((b: any) => b.token.toLowerCase() === tok.toLowerCase())?.amount ?? "0";
  return { gUSD: find(gUSD), gETH: find(gETH) };
}

export async function requestWithdrawTicket(wallet: ethers.Wallet, token: string, amount: string) {
  const timestamp = ts();
  const message = { account: wallet.address, token, amount, timestamp };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, {
    "Withdraw Tokens": [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  }, message);
  const res = await fetch(`${EXTERNAL_API}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: wallet.address, token, amount, timestamp, auth }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Withdraw ticket failed: ${JSON.stringify(data)}`);
  return data;
}
