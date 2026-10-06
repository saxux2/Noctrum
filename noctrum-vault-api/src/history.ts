import { ApiError } from "./errors";
import TransactionModel from "./models/transaction.model";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseLimit(limit: unknown) {
  if (limit === undefined || limit === null || limit === "") return DEFAULT_LIMIT;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) throw new ApiError("bad_request", "limit must be a positive integer");
  return n;
}

export function parseCursor(cursor: unknown) {
  if (cursor === undefined || cursor === null || cursor === "") return "";
  if (typeof cursor !== "string" || !UUID_RE.test(cursor)) {
    throw new ApiError("bad_request", "Invalid cursor");
  }
  return cursor.toLowerCase();
}

type TxDoc = {
  id: string;
  type: string;
  account?: string | null;
  sender?: string | null;
  recipient?: string | null;
  recipientAddress?: string | null;
  token: string;
  amount: string;
  txHash?: string | null;
  isSenderHidden?: boolean | null;
  status?: string | null;
};

/** CPT wire shape, from `viewer`'s point of view. */
export function formatTransaction(tx: TxDoc, viewer: string) {
  const base = { id: tx.id, type: tx.type };
  if (tx.type === "transfer") {
    const isOutgoing = tx.sender === viewer;
    const hidden = !!tx.isSenderHidden;
    return {
      ...base,
      // The recipient only sees the sender when it is not hidden.
      ...(isOutgoing || !hidden ? { sender: tx.sender } : {}),
      // Show the address the sender used, never the owner behind a shielded one.
      recipient: tx.recipientAddress ?? tx.recipient,
      token: tx.token,
      amount: tx.amount,
      is_incoming: !isOutgoing,
      is_sender_hidden: hidden,
    };
  }
  return {
    ...base,
    account: tx.account,
    token: tx.token,
    amount: tx.amount,
    ...(tx.txHash ? { tx_hash: tx.txHash } : {}),
    ...(tx.type === "withdrawal" ? { status: tx.status } : {}),
  };
}

/** Newest first; `cursor` is the id of the last item already seen. */
export async function listTransactions(account: string, limit: number, cursor: string) {
  const viewer = account.toLowerCase();
  const pageSize = Math.min(limit, MAX_LIMIT);
  const filter: Record<string, unknown> = {
    $or: [{ account: viewer }, { sender: viewer }, { recipient: viewer }],
  };
  if (cursor) filter.id = { $lt: cursor };

  const rows = await TransactionModel.find(filter).sort({ id: -1 }).limit(pageSize + 1).lean();
  const has_more = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  return {
    transactions: page.map((tx) => formatTransaction(tx as TxDoc, viewer)),
    has_more,
    next_cursor: has_more ? page[page.length - 1]!.id : null,
  };
}
