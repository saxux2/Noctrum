import mongoose from "mongoose";

// One ledger history entry. Deposits/withdrawals come from vault events
// (eventKey = "<txHash>:<logIndex>", unique, makes indexing idempotent).
// Transfers: `recipient` is the resolved real account (used for lookups),
// `recipientAddress` is the address the sender used (may be shielded).
// `id` is a UUID v7, so it sorts by creation time and doubles as the cursor.
// Withdrawals are created by /withdraw (pending) with their ticket's nonce,
// deadline and EIP-712 digest (`ticketHash`, = the vault's `withdrawTicketHash`);
// the indexer completes them from `Withdraw` events, the sweeper refunds them.
const transactionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    type: { type: String, enum: ["deposit", "withdrawal", "transfer"], required: true },
    account: { type: String },
    sender: { type: String },
    recipient: { type: String },
    recipientAddress: { type: String },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    txHash: { type: String },
    eventKey: { type: String },
    blockNumber: { type: Number },
    isSenderHidden: { type: Boolean },
    status: { type: String, enum: ["pending", "completed", "refunded"] },
    nonce: { type: String },
    deadline: { type: Number },
    ticketHash: { type: String },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false },
);

transactionSchema.index({ eventKey: 1 }, { unique: true, sparse: true });
transactionSchema.index({ nonce: 1 }, { unique: true, sparse: true });
transactionSchema.index({ ticketHash: 1 }, { unique: true, sparse: true });
transactionSchema.index({ type: 1, status: 1, deadline: 1 });
transactionSchema.index({ account: 1, id: -1 });
transactionSchema.index({ sender: 1, id: -1 });
transactionSchema.index({ recipient: 1, id: -1 });

const TransactionModel = mongoose.model("Transaction", transactionSchema);
export default TransactionModel;
