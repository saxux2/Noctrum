import mongoose, { Schema } from "mongoose";

const balanceSchema = new Schema(
  {
    user: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
  },
  { timestamps: false }
);

balanceSchema.index({ user: 1, token: 1 }, { unique: true });

export default mongoose.model("Balance", balanceSchema);
