import { Hono } from "hono";
import { ethers } from "ethers";
import noctrumRoute from "../routes/noctrum.routes";
import { EIP712_DOMAIN, MESSAGE_TYPES } from "../auth";
import { config } from "../config";
import LendIntentModel from "../models/lend-intent.model";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import CreditScoreModel from "../models/credit-score.model";
import type { CreditTier } from "../types";

export const app = new Hono().route("/api/v1", noctrumRoute);

export const NUSD = config.TOKEN_ADDRESS.toLowerCase();
export const NETH = config.NETH_ADDRESS.toLowerCase();
export const E18 = 10n ** 18n;
export const wei = (n: number | string) => ethers.parseEther(String(n)).toString();

export function ts() {
  return Math.floor(Date.now() / 1000);
}

export async function sign(
  wallet: ethers.HDNodeWallet | ethers.Wallet,
  primaryType: keyof typeof MESSAGE_TYPES,
  fields: Record<string, unknown>,
  domain: ethers.TypedDataDomain = EIP712_DOMAIN,
) {
  const message = { account: wallet.address, ...fields, timestamp: fields.timestamp ?? ts() };
  const types = { [primaryType]: [...MESSAGE_TYPES[primaryType]] };
  const auth = await wallet.signTypedData(domain, types, message);
  return { ...message, auth };
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function get(path: string, headers: Record<string, string> = {}) {
  return app.request(`/api/v1${path}`, { headers });
}

export async function setTier(address: string, tier: CreditTier, loansRepaid = 0, loansDefaulted = 0) {
  await CreditScoreModel.updateOne(
    { address: address.toLowerCase() },
    { tier, loansRepaid, loansDefaulted },
    { upsert: true },
  );
}

export type Tick = { lender: string; lendIntentId: string; amount: string; rate: number };

export async function seedLendIntent(intentId: string, userId: string, amount: string, token = NUSD) {
  await LendIntentModel.create({
    intentId,
    userId: userId.toLowerCase(),
    token,
    amount,
    encryptedRate: "0xenc",
    epochId: 1,
    createdAt: Date.now(),
  });
}

export async function seedBorrowIntent(
  intentId: string,
  borrower: string,
  over: Record<string, unknown> = {},
) {
  await BorrowIntentModel.create({
    intentId,
    borrower: borrower.toLowerCase(),
    token: NUSD,
    amount: wei(100),
    encryptedMaxRate: "0xenc",
    collateralToken: NUSD,
    collateralAmount: wei(250),
    status: "pending",
    createdAt: Date.now(),
    ...over,
  });
}

export async function seedProposal(
  proposalId: string,
  borrower: string,
  ticks: Tick[],
  over: Record<string, unknown> = {},
) {
  const principal = ticks.reduce((s, t) => s + BigInt(t.amount), 0n).toString();
  await MatchProposalModel.create({
    proposalId,
    borrowIntentId: "bi-1",
    borrower: borrower.toLowerCase(),
    token: NUSD,
    principal,
    matchedTicks: ticks,
    effectiveBorrowerRate: 0.062,
    collateralToken: NUSD,
    collateralAmount: wei(250),
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...over,
  });
}

export async function seedLoan(
  loanId: string,
  borrower: string,
  ticks: Tick[],
  over: Record<string, unknown> = {},
) {
  const principal = ticks.reduce((s, t) => s + BigInt(t.amount), 0n).toString();
  await LoanModel.create({
    loanId,
    borrower: borrower.toLowerCase(),
    token: NUSD,
    principal,
    matchedTicks: ticks,
    effectiveBorrowerRate: 0.062,
    collateralToken: NUSD,
    collateralAmount: wei(250),
    requiredCollateral: wei(200),
    maturity: Date.now() + 30 * 24 * 60 * 60 * 1000,
    status: "active",
    repaidAmount: "0",
    ...over,
  });
}

/** Lender A 60 @ 5%, lender B 40 @ 8% — the TESTING §2.3 reference loan. */
export function referenceTicks(lenderA: string, lenderB: string): Tick[] {
  return [
    { lender: lenderA.toLowerCase(), lendIntentId: "li-a", amount: wei(60), rate: 0.05 },
    { lender: lenderB.toLowerCase(), lendIntentId: "li-b", amount: wei(40), rate: 0.08 },
  ];
}
