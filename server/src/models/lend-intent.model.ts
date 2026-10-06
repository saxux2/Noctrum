import mongoose, { Schema } from "mongoose";

const lendIntentSchema = new Schema(
  {
    intentId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    encryptedRate: { type: String, required: true },
    epochId: { type: Number, required: true },
    createdAt: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("LendIntent", lendIntentSchema);
