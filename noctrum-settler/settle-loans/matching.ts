import { decrypt } from "eciesjs";

// ── Types ───────────────────────────────────────────

export interface LendIntent {
  intentId: string;
  userId: string;
  token: string;
  amount: string;
  encryptedRate: string;
}

export interface BorrowIntent {
  intentId: string;
  borrower: string;
  token: string;
  amount: string;
  encryptedMaxRate: string;
  collateralToken: string;
  collateralAmount: string;
  status: string;
}

export interface MatchedTick {
  lender: string;
  lendIntentId: string;
  amount: string;
  rate: number;
}

export interface Proposal {
  proposalId: string;
  borrowIntentId: string;
  borrower: string;
  token: string;
  principal: string;
  matchedTicks: MatchedTick[];
  effectiveBorrowerRate: number;
  collateralToken: string;
  collateralAmount: string;
}

// ── Rate decryption ─────────────────────────────────

export function decryptRate(encryptedRate: string, privateKeyHex?: string): number {
  // Try plaintext first (test mode)
  const parsed = Number(encryptedRate);
  if (!isNaN(parsed) && parsed > 0 && parsed < 1) return parsed;

  // Try ECIES decryption
  if (privateKeyHex) {
    try {
      const encrypted = Buffer.from(encryptedRate.replace(/^0x/i, ""), "hex");
      const decrypted = decrypt(privateKeyHex, encrypted);
      const rate = Number(new TextDecoder().decode(decrypted));
      if (!isNaN(rate) && rate > 0 && rate < 1) return rate;
    } catch (_) {
      // decryption failed, fall through
    }
  }

  return 0.05;
}

// ── Matching engine ─────────────────────────────────

export function runMatchingEngine(
  lendIntents: LendIntent[],
  borrowIntents: BorrowIntent[],
  privateKeyHex?: string,
): Proposal[] {
  const lends = lendIntents.map((l) => ({
    intentId: l.intentId,
    userId: l.userId,
    token: l.token,
    amount: Number(l.amount),
    rate: decryptRate(l.encryptedRate, privateKeyHex),
  }));

  const borrows = borrowIntents.map((b) => ({
    intentId: b.intentId,
    borrower: b.borrower,
    token: b.token,
    amount: Number(b.amount),
    maxRate: decryptRate(b.encryptedMaxRate, privateKeyHex),
    collateralToken: b.collateralToken,
    collateralAmount: b.collateralAmount,
  }));

  // Sort borrows largest-K-first, lends cheapest-rate-first
  borrows.sort((a, b) => b.amount - a.amount);
  lends.sort((a, b) => a.rate - b.rate);

  const remaining = new Map<string, number>();
  for (const l of lends) remaining.set(l.intentId, l.amount);

  const proposals: Proposal[] = [];

  for (const borrow of borrows) {
    let filled = 0;
    let weightedRateSum = 0;
    const ticks: MatchedTick[] = [];

    for (const lend of lends) {
      if (filled >= borrow.amount) break;
      if (lend.token !== borrow.token) continue;
      const avail = remaining.get(lend.intentId) ?? 0;
      if (avail <= 0) continue;

      const take = Math.min(avail, borrow.amount - filled);
      ticks.push({
        lender: lend.userId,
        lendIntentId: lend.intentId,
        amount: String(take),
        rate: lend.rate,
      });
      weightedRateSum += take * lend.rate;
      filled += take;
      remaining.set(lend.intentId, avail - take);
    }

    if (filled <= 0) continue;

    const blendedRate = weightedRateSum / filled;

    if (blendedRate > borrow.maxRate) {
      for (const t of ticks) {
        const prev = remaining.get(t.lendIntentId) ?? 0;
        remaining.set(t.lendIntentId, prev + Number(t.amount));
      }
      continue;
    }

    proposals.push({
      proposalId: "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      borrowIntentId: borrow.intentId,
      borrower: borrow.borrower,
      token: borrow.token,
      principal: String(filled),
      matchedTicks: ticks,
      effectiveBorrowerRate: blendedRate,
      collateralToken: borrow.collateralToken,
      collateralAmount: borrow.collateralAmount,
    });
  }

  return proposals;
}
