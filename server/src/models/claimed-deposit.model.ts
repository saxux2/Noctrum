import mongoose, { Schema } from "mongoose";

// One row per vault transfer into the pool that has backed a lend deposit,
// borrow collateral, or repayment. The unique transferId stops one transfer
// from being claimed twice.
const claimedDepositSchema = new Schema(
  {
    transferId: { type: String, required: true, unique: true },
    account: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    purpose: { type: String, enum: ["lend", "borrow-collateral", "repay"], required: true },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("ClaimedDeposit", claimedDepositSchema);
