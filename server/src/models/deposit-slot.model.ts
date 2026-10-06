import mongoose, { Schema } from "mongoose";

const depositSlotSchema = new Schema(
  {
    slotId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], required: true },
    encryptedRate: { type: String },
    intentId: { type: String },
    createdAt: { type: Number, required: true },
    epochId: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("DepositSlot", depositSlotSchema);
