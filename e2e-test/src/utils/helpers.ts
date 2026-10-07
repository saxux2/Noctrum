import { ethers } from "ethers";
import { encrypt } from "eciesjs";
import { SERVER, EXTERNAL_API, VAULT_ADDRESS, CHAIN_ID, CRE_PUBKEY, INTERNAL_API_KEY, nUSD, nETH } from "./config";

// ── Domains ─────────────────────────────────────────

export const NOCTRUM_DOMAIN = {
  name: "NoctrumProtocol",
  version: "0.0.1",
  chainId: CHAIN_ID,
  verifyingContract: VAULT_ADDRESS,
};

// noctrum-vault-api (D-5)
export const EXTERNAL_DOMAIN = {
  name: "NoctrumPrivateToken",
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

const serverHeaders = (): Record<string, string> =>
  INTERNAL_API_KEY
    ? { "Content-Type": "application/json", "x-api-key": INTERNAL_API_KEY }
    : { "Content-Type": "application/json" };

export async function post(path: string, body: any) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: serverHeaders(),
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

export async function get(path: string) {
  return fetch(`${SERVER}${path}`, { headers: serverHeaders() }).then(r => r.json()) as any;
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
  return { nUSD: find(nUSD), nETH: find(nETH) };
}

// noctrum-vault-api credits a deposit once its block is finalized, so wait before spending it.
export async function waitForVaultBalance(wallet: ethers.Wallet, token: string, atLeast: bigint, timeoutMs = 60_000) {
  const key = token.toLowerCase() === nETH.toLowerCase() ? "nETH" : "nUSD";
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const bal = BigInt((await getVaultBalances(wallet))[key]);
    if (bal >= atLeast) return bal;
    if (Date.now() > deadline) throw new Error(`deposit not indexed after ${timeoutMs / 1000}s (private ${key} = ${bal})`);
    await new Promise(r => setTimeout(r, 2000));
  }
}

// The server only accepts a borrow intent once the collateral has reached the pool:
// mint (deployer), deposit into the vault, wait for indexing, private-transfer to the pool.
export async function sendCollateralToPool(minter: ethers.Wallet, from: ethers.Wallet, poolAddress: string, amount: string) {
  const token = new ethers.Contract(nETH, [...MINT_ABI, ...ERC20_ABI], minter);
  await (await token.mint(from.address, amount)).wait();
  await (await new ethers.Contract(nETH, ERC20_ABI, from).approve(VAULT_ADDRESS, amount)).wait();
  const before = BigInt((await getVaultBalances(from)).nETH);
  await (await new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, from).deposit(nETH, amount)).wait();
  await waitForVaultBalance(from, nETH, before + BigInt(amount));
  await privateTransfer(from, poolAddress, nETH, amount);
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
