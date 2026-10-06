import mongoose, { Schema } from "mongoose";

const matchedTickSchema = new Schema(
  {
    lender: { type: String, required: true },
    lendIntentId: { type: String, required: true },
    amount: { type: String, required: true },
    rate: { type: Number, required: true },
  },
  { _id: false }
);

const loanSchema = new Schema(
  {
    loanId: { type: String, required: true, unique: true },
    borrower: { type: String, required: true },
    token: { type: String, required: true },
    principal: { type: String, required: true },
    matchedTicks: { type: [matchedTickSchema], required: true },
    effectiveBorrowerRate: { type: Number, required: true },
    collateralToken: { type: String, required: true },
    collateralAmount: { type: String, required: true },
    requiredCollateral: { type: String, required: true },
    maturity: { type: Number, required: true },
    status: { type: String, enum: ["active", "repaid", "defaulted"], required: true },
    repaidAmount: { type: String, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("Loan", loanSchema);
