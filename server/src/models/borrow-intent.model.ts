import mongoose, { Schema } from "mongoose";

const borrowIntentSchema = new Schema(
  {
    intentId: { type: String, required: true, unique: true },
    borrower: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    encryptedMaxRate: { type: String, required: true },
    collateralToken: { type: String, required: true },
    collateralAmount: { type: String, required: true },
    status: { type: String, enum: ["pending", "proposed", "matched", "cancelled", "rejected"], required: true },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("BorrowIntent", borrowIntentSchema);
