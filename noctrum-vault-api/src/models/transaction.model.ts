import mongoose from "mongoose";

// One ledger history entry. Deposits/withdrawals come from vault events
// (eventKey = "<txHash>:<logIndex>", unique, makes indexing idempotent).
const transactionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    type: { type: String, enum: ["deposit", "withdrawal", "transfer"], required: true },
    account: { type: String },
    sender: { type: String },
    recipient: { type: String },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    txHash: { type: String },
    eventKey: { type: String },
    blockNumber: { type: Number },
    isSenderHidden: { type: Boolean },
    status: { type: String, enum: ["pending", "completed", "refunded"] },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false },
);

transactionSchema.index({ eventKey: 1 }, { unique: true, sparse: true });
transactionSchema.index({ account: 1, createdAt: -1 });
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ recipient: 1, createdAt: -1 });

const TransactionModel = mongoose.model("Transaction", transactionSchema);
export default TransactionModel;
