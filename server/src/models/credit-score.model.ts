import mongoose, { Schema } from "mongoose";

const creditScoreSchema = new Schema(
  {
    address: { type: String, required: true, unique: true },
    tier: { type: String, enum: ["bronze", "silver", "gold", "platinum"], required: true },
    loansRepaid: { type: Number, required: true },
    loansDefaulted: { type: Number, required: true },
  },
  { timestamps: false }
);

export default mongoose.model("CreditScore", creditScoreSchema);
