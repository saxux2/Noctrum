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

const matchProposalSchema = new Schema(
  {
    proposalId: { type: String, required: true, unique: true },
    borrowIntentId: { type: String, required: true },
    borrower: { type: String, required: true },
    token: { type: String, required: true },
    principal: { type: String, required: true },
    matchedTicks: { type: [matchedTickSchema], required: true },
    effectiveBorrowerRate: { type: Number, required: true },
    collateralToken: { type: String, required: true },
    collateralAmount: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected", "expired"], required: true },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("MatchProposal", matchProposalSchema);
