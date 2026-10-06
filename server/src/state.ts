import type { CreditTier, PendingTransfer } from "./types";

export { default as DepositSlotModel } from "./models/deposit-slot.model";
export { default as LendIntentModel } from "./models/lend-intent.model";
export { default as BorrowIntentModel } from "./models/borrow-intent.model";
export { default as MatchProposalModel } from "./models/match-proposal.model";
export { default as LoanModel } from "./models/loan.model";
export { default as PendingTransferModel } from "./models/pending-transfer.model";
export { default as BalanceModel } from "./models/balance.model";
export { default as CreditScoreModel } from "./models/credit-score.model";

import PendingTransferModel from "./models/pending-transfer.model";
import BalanceModel from "./models/balance.model";
import CreditScoreModel from "./models/credit-score.model";
import DepositSlotModel from "./models/deposit-slot.model";

const SLOT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── transient in-memory ──
export let currentEpoch: number = 1;
export function setCurrentEpoch(v: number) {
  currentEpoch = v;
}

// ── collateral multiplier (pure, no DB) ──
export function getCollateralMultiplier(tier: CreditTier): number {
  switch (tier) {
    case "platinum": return 1.2;
    case "gold": return 1.5;
    case "silver": return 1.8;
    case "bronze": return 2.0;
  }
}

// ── helpers ──

export async function queueTransfer(
  recipient: string,
  token: string,
  amount: string,
  reason: PendingTransfer["reason"],
): Promise<string> {
  const transferId = crypto.randomUUID();
  await PendingTransferModel.create({
    transferId,
    recipient: recipient.toLowerCase(),
    token: token.toLowerCase(),
    amount,
    reason,
    createdAt: Date.now(),
    status: "pending",
  });
  return transferId;
}

export async function creditBalance(
  user: string,
  token: string,
  amount: bigint,
): Promise<void> {
  const u = user.toLowerCase();
  const t = token.toLowerCase();
  const doc = await BalanceModel.findOne({ user: u, token: t });
  if (doc) {
    const current = BigInt(doc.amount);
    doc.amount = (current + amount).toString();
    await doc.save();
  } else {
    await BalanceModel.create({ user: u, token: t, amount: amount.toString() });
  }
}

export async function debitBalance(
  user: string,
  token: string,
  amount: bigint,
): Promise<boolean> {
  const u = user.toLowerCase();
  const t = token.toLowerCase();
  const doc = await BalanceModel.findOne({ user: u, token: t });
  if (!doc) return false;
  const current = BigInt(doc.amount);
  if (current < amount) return false;
  doc.amount = (current - amount).toString();
  await doc.save();
  return true;
}

export async function getBalance(
  user: string,
  token: string,
): Promise<bigint> {
  const doc = await BalanceModel.findOne({
    user: user.toLowerCase(),
    token: token.toLowerCase(),
  });
  return doc ? BigInt(doc.amount) : 0n;
}

export async function getCreditScore(
  user: string,
): Promise<{ address: string; tier: CreditTier; loansRepaid: number; loansDefaulted: number }> {
  const addr = user.toLowerCase();
  let doc = await CreditScoreModel.findOne({ address: addr });
  if (!doc) {
    doc = await CreditScoreModel.create({
      address: addr,
      tier: "bronze",
      loansRepaid: 0,
      loansDefaulted: 0,
    });
  }
  return {
    address: doc.address as string,
    tier: doc.tier as CreditTier,
    loansRepaid: doc.loansRepaid as number,
    loansDefaulted: doc.loansDefaulted as number,
  };
}

const TIER_ORDER: CreditTier[] = ["bronze", "silver", "gold", "platinum"];

export async function upgradeTier(user: string): Promise<void> {
  const addr = user.toLowerCase();
  const score = await getCreditScore(addr);
  const idx = TIER_ORDER.indexOf(score.tier);
  if (idx < TIER_ORDER.length - 1) {
    await CreditScoreModel.updateOne(
      { address: addr },
      { tier: TIER_ORDER[idx + 1] },
    );
  }
}

export async function downgradeTier(user: string): Promise<void> {
  const addr = user.toLowerCase();
  const score = await getCreditScore(addr);
  const idx = TIER_ORDER.indexOf(score.tier);
  if (idx > 0) {
    await CreditScoreModel.updateOne(
      { address: addr },
      { tier: TIER_ORDER[idx - 1] },
    );
  }
}

export async function expireOldSlots(): Promise<number> {
  const cutoff = Date.now() - SLOT_TTL_MS;
  const result = await DepositSlotModel.updateMany(
    { status: "pending", createdAt: { $lt: cutoff } },
    { status: "cancelled" },
  );
  return result.modifiedCount;
}
