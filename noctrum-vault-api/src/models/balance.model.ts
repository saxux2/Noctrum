import mongoose from "mongoose";

const balanceSchema = new mongoose.Schema(
  {
    account: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true, default: "0" },
  },
  { timestamps: false },
);

balanceSchema.index({ account: 1, token: 1 }, { unique: true });

const BalanceModel = mongoose.model("Balance", balanceSchema);
export default BalanceModel;
