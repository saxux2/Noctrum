import mongoose, { Schema } from "mongoose";

const pendingTransferSchema = new Schema(
  {
    transferId: { type: String, required: true, unique: true },
    recipient: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    reason: {
      type: String,
      enum: ["cancel-lend", "cancel-borrow", "disburse", "return-collateral", "repay-lender", "return-collateral-repay", "liquidate"],
      required: true,
    },
    createdAt: { type: Number, required: true },
    status: { type: String, enum: ["pending", "completed", "failed"], required: true },
  },
  { timestamps: false }
);

export default mongoose.model("PendingTransfer", pendingTransferSchema);
