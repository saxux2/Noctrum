import { listPoolTransactions } from "./external-api";
import ClaimedDepositModel from "./models/claimed-deposit.model";

type Purpose = "lend" | "borrow-collateral" | "repay";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Proof that `account` actually sent `amount` of `token` to the pool before the
 * server credits a deposit, accepts collateral, or pays lenders. Finds an
 * incoming vault transfer from `account` with exactly that token and amount
 * that no earlier request has claimed, and marks it claimed. Returns false if
 * there is none among the pool's most recent transfers.
 */
export async function claimIncomingTransfer(
  account: string,
  token: string,
  amount: bigint,
  purpose: Purpose,
): Promise<boolean> {
  const sender = account.toLowerCase();
  const t = token.toLowerCase();
  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await listPoolTransactions(PAGE_SIZE, cursor);
    const candidates = res.transactions.filter(
      (tx) =>
        tx.type === "transfer" &&
        tx.is_incoming &&
        String(tx.sender ?? "").toLowerCase() === sender &&
        String(tx.token).toLowerCase() === t &&
        BigInt(tx.amount) === amount,
    );
    if (candidates.length) {
      const taken = new Set(
        (
          await ClaimedDepositModel.find({ transferId: { $in: candidates.map((tx) => tx.id) } }, { transferId: 1 }).lean()
        ).map((d) => d.transferId),
      );
      for (const tx of candidates) {
        if (taken.has(tx.id)) continue;
        try {
          await ClaimedDepositModel.create({
            transferId: tx.id,
            account: sender,
            token: t,
            amount: amount.toString(),
            purpose,
            createdAt: Date.now(),
          });
          return true;
        } catch (err: any) {
          // A concurrent request claimed it first; try the next one.
          if (err?.code !== 11000) throw err;
        }
      }
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return false;
}
