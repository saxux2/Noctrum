import { ethers } from "ethers";
import { encrypt } from "eciesjs";
import {
  SERVER,
  EXTERNAL_API,
  CRE_PUBKEY,
  EXTERNAL_DOMAIN,
  PRIVATE_TRANSFER_TYPES,
  BALANCE_TYPES,
  WITHDRAW_TYPES,
  NOCTRUM_DOMAIN,
  REPAY_LOAN_TYPES,
  fetchPoolAddress,
} from "./constants";

export const ts = () => Math.floor(Date.now() / 1000);
export const toWei = (n: number) => ethers.parseEther(n.toString()).toString();

export function encryptRate(rate: string): string {
  const buf = encrypt(CRE_PUBKEY, Buffer.from(rate));
  return "0x" + Buffer.from(buf).toString("hex");
}

export async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `${path} failed (${res.status}): ${JSON.stringify(data)}`
    );
  return data;
}

export async function get(path: string) {
  const res = await fetch(`${SERVER}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function privateTransfer(
  signer: ethers.Signer,
  to: string,
  token: string,
  amount: string
) {
  const address = await signer.getAddress();
  const timestamp = ts();
  const message = {
    sender: address,
    recipient: to,
    token,
    amount,
    flags: [] as string[],
    timestamp,
  };
  const auth = await (signer as ethers.Wallet & { signTypedData: Function }).signTypedData(
    EXTERNAL_DOMAIN,
    PRIVATE_TRANSFER_TYPES,
    message
  );
  const res = await fetch(`/external/private-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: address,
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

export async function fetchPrivateBalances(signer: ethers.Signer) {
  const account = await signer.getAddress();
  const timestamp = ts();
  const message = { account, timestamp };
  const auth = await (signer as any).signTypedData(
    EXTERNAL_DOMAIN,
    BALANCE_TYPES,
    message
  );
  const res = await fetch(`/external/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, timestamp, auth }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Balances failed: ${JSON.stringify(data)}`);
  return data;
}

export async function requestWithdrawTicket(
  signer: ethers.Signer,
  token: string,
  amount: string
) {
  const account = await signer.getAddress();
  const timestamp = ts();
  const message = { account, token, amount, timestamp };
  const auth = await (signer as any).signTypedData(
    EXTERNAL_DOMAIN,
    WITHDRAW_TYPES,
    message
  );
  const res = await fetch(`/external/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, token, amount, timestamp, auth }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Withdraw failed: ${JSON.stringify(data)}`);
  return data;
}

// Remembers which steps of a multi-step money flow (lend, borrow, repay) already succeeded,
// so a retry after a later failure resumes instead of depositing or transferring funds again.
export interface FlowProgress {
  step: number;
  data: Record<string, string>;
}

const PROGRESS_PREFIX = "noctrum-progress:";

export function loadProgress(key: string): FlowProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_PREFIX + key);
    if (raw) return JSON.parse(raw) as FlowProgress;
  } catch {}
  return { step: 0, data: {} };
}

export function saveProgress(key: string, progress: FlowProgress) {
  try {
    localStorage.setItem(PROGRESS_PREFIX + key, JSON.stringify(progress));
  } catch {}
}

export function clearProgress(key: string) {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + key);
  } catch {}
}

// Repay = private transfer of totalDue to the pool, then the signed repay request.
// The transfer is recorded per loan, so retrying after a failed request does not pay twice.
export async function repayLoan(signer: ethers.Signer, loanId: string, token: string, totalDue: string) {
  const account = await signer.getAddress();
  const key = `repay:${account.toLowerCase()}:${loanId}`;
  if (loadProgress(key).step < 1) {
    await privateTransfer(signer, await fetchPoolAddress(), token, totalDue);
    saveProgress(key, { step: 1, data: {} });
  }
  const message = { account, loanId, amount: totalDue, timestamp: ts() };
  const auth = await signer.signTypedData(NOCTRUM_DOMAIN, REPAY_LOAN_TYPES, message);
  const result = await post("/api/v1/repay", { ...message, auth });
  clearProgress(key);
  return result;
}
