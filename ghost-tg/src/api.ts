import { ethers } from "ethers";
import { encrypt } from "eciesjs";
import { GHOST_API, EXTERNAL_API, CRE_PUBKEY, gUSD, gETH, RPC_URL } from "./config";
import { EXTERNAL_DOMAIN, PRIVATE_TRANSFER_TYPES, BALANCE_TYPES, WITHDRAW_TYPES } from "./constants";

// Signer type that works for both ethers.Wallet and WCSigner
type Signer = { address: string; signTypedData: (domain: any, types: any, value: any) => Promise<string> };

// ── Helpers ──

export const ts = () => Math.floor(Date.now() / 1000);
export const toWei = (n: number) => ethers.parseEther(n.toString()).toString();
export const fmtEth = (wei: string | bigint) => {
  const n = Number(BigInt(wei)) / 1e18;
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

export function tokenSymbol(addr: string): string {
  const lower = addr.toLowerCase();
  if (lower === gUSD.toLowerCase()) return "gUSD";
  if (lower === gETH.toLowerCase()) return "gETH";
  return addr.slice(0, 6) + "...";
}

export function resolveToken(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (lower === "gusd" || lower === "usd" || lower === "g-usd" || lower === "dollar") return gUSD;
  if (lower === "geth" || lower === "eth" || lower === "g-eth" || lower === "ether") return gETH;
  if (lower.startsWith("0x") && lower.length === 42) return input;
  return null;
}

export function encryptRate(rate: string): string {
  const buf = encrypt(CRE_PUBKEY, Buffer.from(rate));
  return "0x" + Buffer.from(buf).toString("hex");
}

const MIN_GAS_WEI = ethers.parseEther("0.001"); // ~0.001 ETH minimum for gas

export async function ensureGasBalance(address: string, provider: ethers.Provider): Promise<void> {
  const balance = await provider.getBalance(address);
  if (balance < MIN_GAS_WEI) {
    const bal = Number(balance) / 1e18;
    throw new Error(
      `Not enough ETH for gas fees.\n\n` +
      `Your ETH balance: ${bal.toFixed(6)} ETH\n` +
      `Minimum required: ~0.001 ETH\n\n` +
      `Get Sepolia ETH from a faucet first.`
    );
  }
}

export async function ensureTokenBalance(
  address: string,
  token: string,
  requiredWei: string,
  provider: ethers.Provider,
): Promise<void> {
  const erc20 = new ethers.Contract(token, ["function balanceOf(address) view returns (uint256)"], provider);
  const balance: bigint = await erc20.balanceOf(address);
  const required = BigInt(requiredWei);
  if (balance < required) {
    const sym = tokenSymbol(token);
    const has = Number(balance) / 1e18;
    const needs = Number(required) / 1e18;
    throw new Error(
      `Insufficient ${sym} balance.\n\n` +
      `You have: ${has.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sym}\n` +
      `Required: ${needs.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sym}\n\n` +
      `Get more ${sym} via /swap or deposit from another wallet.`
    );
  }
}

// ── Ghost API ──

export async function ghostPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${GHOST_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

export async function ghostGet(path: string): Promise<any> {
  const res = await fetch(`${GHOST_API}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

// ── External API (vault) ──

export async function privateTransfer(
  wallet: Signer,
  recipient: string,
  token: string,
  amount: string,
): Promise<any> {
  const timestamp = ts();
  const message = {
    sender: wallet.address,
    recipient,
    token,
    amount,
    flags: [] as string[],
    timestamp,
  };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, PRIVATE_TRANSFER_TYPES, message);
  const res = await fetch(`${EXTERNAL_API}/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: wallet.address,
      recipient,
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

export async function getVaultBalances(
  wallet: Signer,
): Promise<{ gUSD: string; gETH: string }> {
  const timestamp = ts();
  const message = { account: wallet.address, timestamp };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, BALANCE_TYPES, message);
  const res = await fetch(`${EXTERNAL_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: wallet.address, timestamp, auth }),
  });
  const data: any = await res.json();
  const balances = data.balances ?? [];
  const find = (tok: string) =>
    balances.find((b: any) => b.token?.toLowerCase() === tok.toLowerCase())?.amount ?? "0";
  return { gUSD: find(gUSD), gETH: find(gETH) };
}

export async function requestWithdrawTicket(
  wallet: Signer,
  token: string,
  amount: string,
): Promise<any> {
  const timestamp = ts();
  const message = { account: wallet.address, token, amount, timestamp };
  const auth = await wallet.signTypedData(EXTERNAL_DOMAIN, WITHDRAW_TYPES, message);
  const res = await fetch(`${EXTERNAL_API}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: wallet.address, token, amount, timestamp, auth }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Withdraw ticket failed: ${JSON.stringify(data)}`);
  return data;
}

export async function getPoolAddress(): Promise<string> {
  const data = await ghostGet("/health");
  return data.poolAddress;
}

export async function getOnChainBalances(
  address: string,
  provider: ethers.Provider,
): Promise<{ gUSD: string; gETH: string; ETH: string }> {
  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
  const gusdContract = new ethers.Contract(gUSD, erc20Abi, provider);
  const gethContract = new ethers.Contract(gETH, erc20Abi, provider);
  const [gusdBal, gethBal, ethBal] = await Promise.all([
    gusdContract.balanceOf(address),
    gethContract.balanceOf(address),
    provider.getBalance(address),
  ]);
  return {
    gUSD: gusdBal.toString(),
    gETH: gethBal.toString(),
    ETH: ethBal.toString(),
  };
}
